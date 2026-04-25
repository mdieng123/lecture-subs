import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { v4 as uuidv4 } from 'uuid'
import type { Cue } from '../types'

interface ChunkResult {
  start_seconds: number
  end_seconds: number
  arabic: string
  english: string
}

export default function ProcessingScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const setProject = useProjectStore((s) => s.setProject)
  const processing = useProjectStore((s) => s.processing)
  const setProcessing = useProjectStore((s) => s.setProcessing)
  const settings = useProjectStore((s) => s.settings)
  const [logOpen, setLogOpen] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [partialCues, setPartialCues] = useState<Cue[] | null>(null)
  const [rateLimitSecsLeft, setRateLimitSecsLeft] = useState<number | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<{ used: number; limit: number; requested: number } | null>(null)
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoPathRef = useRef<string | null>(null)
  const durationRef = useRef(0)
  const tmpDirRef = useRef<string | null>(null)

  function addLog(msg: string) {
    setProcessing((prev) => prev ? {
      ...prev,
      log: [...prev.log, `[${new Date().toLocaleTimeString()}] ${msg}`],
    } : prev)
  }

  function setError(msg: string) {
    setProcessing((prev) => prev ? { ...prev, error: msg } : prev)
  }

  useEffect(() => {
    const removeProgress = window.api.ffmpeg.onProgress((data: unknown) => {
      const d = data as { stage?: string; percent?: number }
      if (d.stage === 'extracting') {
        setProcessing((prev) => prev ? { ...prev, stageProgress: d.percent ?? 0 } : prev)
      }
    })
    const removeChunkProgress = window.api.gemini.onChunkProgress((data: unknown) => {
      const d = data as { chunkIndex?: number; totalChunks?: number; status?: string; retryInMs?: number; used?: number; limit?: number; requested?: number }
      if (d.status === 'transcribing') {
        setProcessing((prev) => prev ? {
          ...prev,
          currentChunk: (d.chunkIndex ?? 0) + 1,
          totalChunks: d.totalChunks ?? prev.totalChunks,
        } : prev)
        addLog(`Transcribing chunk ${(d.chunkIndex ?? 0) + 1}/${d.totalChunks ?? '?'}...`)
        setRateLimitSecsLeft(null)
        setRateLimitInfo(null)
        if (rateLimitTimerRef.current) { clearInterval(rateLimitTimerRef.current); rateLimitTimerRef.current = null }
      } else if (d.status === 'quota_exhausted') {
        if (d.used && d.limit) setRateLimitInfo({ used: d.used, limit: d.limit, requested: d.requested ?? 0 })
        setRateLimitSecsLeft(null)
        if (rateLimitTimerRef.current) { clearInterval(rateLimitTimerRef.current); rateLimitTimerRef.current = null }
      } else if (d.status === 'waiting') {
        const secs = Math.ceil((d.retryInMs ?? 1000) / 1000)
        addLog(`Rate limit — waiting ${secs}s to retry chunk ${(d.chunkIndex ?? 0) + 1}...`)
        if (d.used && d.limit && d.requested) {
          setRateLimitInfo({ used: d.used, limit: d.limit, requested: d.requested })
        }
        if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current)
        setRateLimitSecsLeft(secs)
        rateLimitTimerRef.current = setInterval(() => {
          setRateLimitSecsLeft((prev) => {
            if (prev === null || prev <= 1) {
              clearInterval(rateLimitTimerRef.current!)
              rateLimitTimerRef.current = null
              return null
            }
            return prev - 1
          })
        }, 1000)
      }
    })
    return () => { removeProgress(); removeChunkProgress() }
  }, [])

  useEffect(() => {
    runPipeline()
  }, [])

  async function runPipeline() {
    try {
      const tmpDir = await window.api.files.getTmpDir()
      tmpDirRef.current = tmpDir

      const videoPath = processing?.videoPath
      if (!videoPath) {
        setError('No video path — please restart from Import screen.')
        return
      }
      videoPathRef.current = videoPath

      // Stage 1: Extract audio
      setProcessing((prev) => prev ? { ...prev, stage: 'extracting', stageProgress: 0 } : prev)
      addLog('Extracting audio (mono 16kHz FLAC)...')

      const audioPath = `${tmpDir}/audio.flac`
      const extraction = await window.api.ffmpeg.extractAudio(videoPath, audioPath)
      durationRef.current = extraction.duration
      addLog(`Audio extracted: ${(extraction.duration / 60).toFixed(1)} min`)

      if (cancelled) return

      // Stage 2: Chunking
      setProcessing((prev) => prev ? { ...prev, stage: 'transcribing', stageProgress: 0 } : prev)
      addLog('Detecting silence boundaries for chunking...')

      const silences = await window.api.ffmpeg.detectSilences(audioPath)
      addLog(`Found ${silences.length} silence points`)

      const chunkMinutes = settings.chunkMinutes
      const chunkSeconds = chunkMinutes * 60
      const totalDuration = extraction.duration
      const OVERLAP = 2

      // Compute chunk specs
      const chunks: Array<{ start: number; duration: number; offsetSeconds: number }> = []
      let cursor = 0
      while (cursor < totalDuration) {
        const target = cursor + chunkSeconds
        if (target >= totalDuration) {
          chunks.push({ start: cursor, duration: totalDuration - cursor, offsetSeconds: cursor })
          break
        }
        const windowLow = target - 15
        const windowHigh = target + 15
        const nearby = silences.filter((s: number) => s >= windowLow && s <= windowHigh)
        let splitPoint = target
        if (nearby.length > 0) {
          splitPoint = nearby.reduce((best: number, s: number) =>
            Math.abs(s - target) < Math.abs(best - target) ? s : best, nearby[0])
        }
        const end = Math.min(splitPoint + OVERLAP, totalDuration)
        chunks.push({ start: cursor, duration: end - cursor, offsetSeconds: cursor })
        cursor = splitPoint
      }

      const GROQ_HOURLY_LIMIT = 7200
      if (totalDuration > GROQ_HOURLY_LIMIT * 0.6) {
        addLog(`⚠ Video is ${(totalDuration / 60).toFixed(0)} min. Groq allows ~${(GROQ_HOURLY_LIMIT / 60).toFixed(0)} min of audio per hour — repeated runs on long videos exhaust this quickly.`)
      }
      addLog(`Processing ${chunks.length} chunk(s)...`)
      setProcessing((prev) => prev ? { ...prev, totalChunks: chunks.length } : prev)

      // Split and transcribe chunks (with concurrency limit)
      const allSegments: ChunkResult[][] = new Array(chunks.length)
      const maxConcurrent = settings.maxConcurrentChunks

      async function processChunk(i: number) {
        if (cancelled) return
        const chunk = chunks[i]
        const chunkPath = `${tmpDir}/chunk-${i}.mp3`
        await window.api.ffmpeg.splitAudio(audioPath, chunk.start, chunk.duration, chunkPath)
        const result = await window.api.gemini.transcribeChunk(
          chunkPath, i, chunks.length, chunk.offsetSeconds
        )
        if (result.error) throw new Error(`Chunk ${i}: ${result.error}`)
        allSegments[i] = result.segments
      }

      // Process in batches
      for (let i = 0; i < chunks.length; i += maxConcurrent) {
        if (cancelled) return
        const batch = chunks.slice(i, i + maxConcurrent).map((_, j) => processChunk(i + j))
        await Promise.all(batch)
        setProcessing((prev) => prev ? { ...prev, stageProgress: ((i + maxConcurrent) / chunks.length) * 100 } : prev)
      }

      if (cancelled) return

      // Stage 3: Merge
      setProcessing((prev) => prev ? { ...prev, stage: 'finalizing', stageProgress: 0 } : prev)
      addLog('Merging chunks and building cue list...')

      const merged: ChunkResult[] = []
      const seen = new Set<number>()
      for (let i = 0; i < allSegments.length; i++) {
        const segs = allSegments[i] ?? []
        const nextOffset = i + 1 < chunks.length ? chunks[i + 1].offsetSeconds : Infinity
        for (const seg of segs) {
          if (i < allSegments.length - 1 && seg.start_seconds >= nextOffset - OVERLAP) continue
          const key = Math.round(seg.start_seconds * 100)
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(seg)
        }
      }
      merged.sort((a, b) => a.start_seconds - b.start_seconds)

      // Sanitize: fix reversed timestamps and clamp to audio duration
      for (const seg of merged) {
        if (seg.end_seconds < seg.start_seconds) {
          seg.end_seconds = seg.start_seconds + 1.0
        }
        if (seg.end_seconds > totalDuration + 0.5) {
          seg.end_seconds = totalDuration
        }
      }

      addLog(`Built ${merged.length} subtitle cues.`)

      // Snap each cue's end to the next cue's start so over-extended Gemini timestamps
      // never cause a subtitle to freeze on screen through the following cue's content.
      const cues: Cue[] = merged.map((seg, i) => {
        const nextStart = merged[i + 1]?.start_seconds
        const snappedEnd = nextStart !== undefined && seg.end_seconds > nextStart
          ? nextStart
          : seg.end_seconds
        return {
          id: uuidv4(),
          startSeconds: seg.start_seconds,
          endSeconds: snappedEnd,
          arabic: seg.arabic,
          english: seg.english,
        }
      })

      const snapped = cues.filter((c, i) => c.endSeconds < merged[i].end_seconds).length
      if (snapped > 0) addLog(`Snapped end time on ${snapped} cue(s) to prevent overlap.`)

      setPartialCues(cues)

      setProject({
        videoPath,
        audioPath,
        durationSeconds: totalDuration,
        cues,
        history: [],
        future: [],
        createdAt: Date.now(),
        audioOnly: processing?.audioOnly,
      })

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isQuota = msg.includes('QUOTA_EXHAUSTED') || msg.includes('QUOTA_ALREADY_EXHAUSTED')
      if (!isQuota) setError(msg)
    }
  }

  function handleContinuePartial() {
    if (!partialCues || !videoPathRef.current) return
    setProject({
      videoPath: videoPathRef.current,
      audioPath: `${tmpDirRef.current}/audio.flac`,
      durationSeconds: durationRef.current,
      cues: partialCues,
      history: [],
      future: [],
      createdAt: Date.now(),
      audioOnly: processing?.audioOnly,
    })
  }

  const stageLabels = {
    extracting: '1. Extracting audio',
    transcribing: '2. Transcribing',
    finalizing: '3. Finalizing',
  }

  const stage = processing?.stage ?? 'extracting'
  const progress = processing?.stageProgress ?? 0
  const error = processing?.error
  const log = processing?.log ?? []
  const currentChunk = processing?.currentChunk
  const totalChunks = processing?.totalChunks

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
      <div className="w-full max-w-xl space-y-6">
        {/* Stage indicator */}
        <div className="flex items-center gap-2 text-sm">
          {(['extracting', 'transcribing', 'finalizing'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-[hsl(215,15%,40%)]">→</span>}
              <span className={s === stage ? 'text-[hsl(210,80%,65%)] font-medium' : 'text-[hsl(215,15%,45%)]'}>
                {stageLabels[s]}
                {s === 'transcribing' && currentChunk && totalChunks &&
                  ` (${currentChunk}/${totalChunks})`}
              </span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-[hsl(222,20%,18%)] rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full bg-[hsl(210,80%,55%)] transition-all duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm space-y-2">
            <div>{error}</div>
            <div className="flex gap-2">
              <button
                onClick={() => setScreen('import')}
                className="px-3 py-1 text-xs border border-red-600/50 rounded hover:bg-red-800/30"
              >
                Back to Import
              </button>
              {partialCues && (
                <button
                  onClick={handleContinuePartial}
                  className="px-3 py-1 text-xs border border-blue-600/50 rounded hover:bg-blue-800/30 text-blue-400"
                >
                  Continue with what we have ({partialCues.length} cues)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Per-chunk rate limit banner (minor, auto-retrying) */}
        {rateLimitSecsLeft !== null && (
          <div className="px-4 py-4 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300 text-sm space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="font-medium">Groq rate limit reached</div>
              <div className="text-2xl font-mono font-bold tabular-nums flex-shrink-0 leading-none">{rateLimitSecsLeft}s</div>
            </div>
            {rateLimitInfo && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-amber-400/90">
                  <span>Quota used this hour</span>
                  <span className="font-mono">{Math.round(rateLimitInfo.used / 60)} / {Math.round(rateLimitInfo.limit / 60)} min</span>
                </div>
                <div className="w-full h-1.5 bg-amber-900/60 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, rateLimitInfo.used / rateLimitInfo.limit * 100).toFixed(1)}%` }} />
                </div>
                <div className="text-xs text-amber-400/70">
                  This chunk needs {Math.round(rateLimitInfo.requested / 60)} min — only {Math.round((rateLimitInfo.limit - rateLimitInfo.used) / 60)} min left. Quota resets on a rolling 1-hour window.
                </div>
              </div>
            )}
            <div className="text-xs text-amber-400/70">Retrying automatically when quota clears — or cancel and come back in {rateLimitSecsLeft > 60 ? `${Math.ceil(rateLimitSecsLeft / 60)} min` : `${rateLimitSecsLeft}s`}.</div>
          </div>
        )}

        {/* Cancel */}
        {!error && (
          <button
            onClick={() => {
              setCancelled(true)
              window.api.gemini.cancelProcessing()
              setScreen('import')
            }}
            className="text-sm text-[hsl(215,15%,50%)] hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}

        {/* Log panel */}
        <div>
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="text-xs text-[hsl(215,15%,45%)] hover:text-white transition-colors"
          >
            {logOpen ? '▼' : '▶'} Log ({log.length} lines)
          </button>
          {logOpen && (
            <div className="mt-2 bg-[hsl(222,20%,8%)] rounded-lg p-3 text-xs font-mono text-[hsl(215,15%,55%)] max-h-48 overflow-y-auto scrollbar-thin">
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
