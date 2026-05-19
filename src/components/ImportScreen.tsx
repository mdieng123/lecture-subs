import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useProjectStore } from '../state/projectStore'
import { useClipsStore } from '../state/clipsStore'
import { useSegmentsStore } from '../state/segmentsStore'
import { useReviewStore } from '../state/reviewStore'
import SettingsDialog from './SettingsDialog'
import { formatDuration } from '../utils'

interface VideoInfo {
  path: string
  name: string
  size: string
  duration: number
}

export default function ImportScreen() {
  const hasApiKey = useProjectStore((s) => s.hasApiKey)
  const hasGroqKey = useProjectStore((s) => s.hasGroqKey)
  const groqQuotaExhaustedAt = useProjectStore((s) => s.groqQuotaExhaustedAt)
  const settings = useProjectStore((s) => s.settings)
  const setScreen = useProjectStore((s) => s.setScreen)
  const setProcessing = useProjectStore((s) => s.setProcessing)
  const setProject = useProjectStore((s) => s.setProject)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [dragging, setDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<'file' | 'youtube'>('file')
  const [audioOnly, setAudioOnly] = useState(false)
  const [loadedYoutubeUrl, setLoadedYoutubeUrl] = useState<string | undefined>()
  const [ytUrl, setYtUrl] = useState('')
  const [ytDownloading, setYtDownloading] = useState(false)
  const [, setYtProgress] = useState(0)
  const [ytStatus, setYtStatus] = useState('')
  const [downloads, setDownloads] = useState<{ name: string; path: string; createdAt: number; url?: string }[]>([])
  const [pendingRestore, setPendingRestore] = useState<{ type: 'clips' | 'segments'; rawJson: string; filePath: string; youtubeUrl: string } | null>(null)
  const [recovery, setRecovery] = useState<{ videoPath: string; cueCount: number; savedAt: number; raw: string } | null>(null)
  const cancelRef = useRef(false)

  function refreshDownloads() {
    window.api.files.listDownloads().then(setDownloads)
  }

  useEffect(() => {
    refreshDownloads()
    window.api.files.getRecovery().then((raw) => {
      if (!raw) return
      try {
        const data = JSON.parse(raw)
        if (data.segments?.length > 0 && Date.now() - data.savedAt < 24 * 60 * 60 * 1000) {
          setRecovery({ videoPath: data.videoPath, cueCount: data.segments.length, savedAt: data.savedAt, raw })
        }
      } catch {}
    })
  }, [])

  useEffect(() => {
    const unsub = window.api.youtube.onProgress((data: unknown) => {
      const d = data as { percent?: number; status?: string }
      if (d.percent !== undefined) setYtProgress(Math.round(d.percent))
      if (d.status) setYtStatus(d.status)
    })
    return () => { unsub() }
  }, [])

  async function handleYouTubeDownload() {
    const url = ytUrl.trim()
    if (!url) return
    setLoadError(null)
    setYtDownloading(true)
    setYtProgress(0)
    setYtStatus('Starting download...')
    cancelRef.current = false

    try {
      const downloadsDir = await window.api.files.getDownloadsDir()
      const ytDir = `${downloadsDir}/yt-${Date.now()}`
      const { filePath, title } = await window.api.youtube.download(url, ytDir)
      if (cancelRef.current) return
      await loadVideo(filePath, title, url)
      refreshDownloads()
    } catch (err) {
      if (!cancelRef.current) {
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setYtDownloading(false)
      setYtStatus('')
    }
  }

  function handleYouTubeCancel() {
    cancelRef.current = true
    window.api.youtube.cancel()
    setYtDownloading(false)
    setYtStatus('')
    setYtProgress(0)
  }

  async function loadVideo(filePath: string, title?: string, youtubeUrl?: string, isAudioOnly?: boolean) {
    setLoadError(null)
    try {
      const { duration, hasAudio } = await window.api.ffmpeg.getVideoDuration(filePath)
      if (!hasAudio) {
        setLoadError('This file has no audio track. Please use a file with audio.')
        return
      }
      const name = title ?? filePath.split(/[/\\]/).pop() ?? filePath
      setVideoInfo({ path: filePath, name, size: 'unknown', duration })
      if (isAudioOnly !== undefined) setAudioOnly(isAudioOnly)
      if (youtubeUrl) setLoadedYoutubeUrl(youtubeUrl)
      setTab('file')
    } catch (err) {
      setLoadError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function loadClipsFile(rawJson: string, filePath: string) {
    try {
      const data = JSON.parse(rawJson)
      const videoExists = await window.api.files.exists(data.videoPath)
      let videoPath = data.videoPath
      if (!videoExists) {
        if (data.youtubeUrl) {
          setPendingRestore({ type: 'clips', rawJson, filePath, youtubeUrl: data.youtubeUrl })
          return
        }
        setLoadError(`Video not found: "${data.videoPath?.split(/[/\\]/).pop()}". Please locate it.`)
        const picked = await window.api.files.openAny()
        if (!picked || picked.endsWith('.lecturesubs') || picked.endsWith('.lectureclips')) {
          setLoadError('Could not locate video — clips not loaded.')
          return
        }
        videoPath = picked
        setLoadError(null)
      }
      // Build a minimal project so the clips screen has videoPath context
      const project = {
        videoPath,
        audioPath: '',
        durationSeconds: 0,
        cues: [],
        history: [],
        future: [],
        createdAt: Date.now(),
        projectFilePath: data.projectFilePath ?? undefined,
      }
      setProject(project)
      useClipsStore.getState().setClips(data.clips ?? [])
      useClipsStore.getState().markSaved(filePath)
      useClipsStore.getState().setReturnScreen('import')
      if (data.reviewIssues?.length) {
        useReviewStore.getState().setIssues(data.reviewIssues)
        useReviewStore.getState().setStatus('done')
      } else {
        useReviewStore.getState().reset()
      }
      setScreen('clips')
    } catch {
      setLoadError('Failed to load clips file.')
    }
  }

  async function loadSegmentsFile(rawJson: string, filePath: string) {
    try {
      const data = JSON.parse(rawJson)
      const videoExists = await window.api.files.exists(data.videoPath)
      let videoPath = data.videoPath
      if (!videoExists) {
        if (data.youtubeUrl) {
          setPendingRestore({ type: 'segments', rawJson, filePath, youtubeUrl: data.youtubeUrl })
          return
        }
        setLoadError(`Video not found: "${data.videoPath?.split(/[/\\]/).pop()}". Please locate it.`)
        const picked = await window.api.files.openAny()
        if (!picked || picked.endsWith('.lecturesubs') || picked.endsWith('.lectureclips') || picked.endsWith('.lecturesegments')) {
          setLoadError('Could not locate video — segments not loaded.')
          return
        }
        videoPath = picked
        setLoadError(null)
      }
      const project = {
        videoPath,
        audioPath: '',
        durationSeconds: 0,
        cues: [],
        history: [],
        future: [],
        createdAt: Date.now(),
        projectFilePath: data.projectFilePath ?? undefined,
      }
      setProject(project)
      useSegmentsStore.getState().setSegments(data.segments ?? [])
      useSegmentsStore.getState().markSaved(filePath)
      useSegmentsStore.getState().setReturnScreen('import')
      if (data.reviewIssues?.length) {
        useReviewStore.getState().setIssues(data.reviewIssues)
        useReviewStore.getState().setStatus('done')
      } else {
        useReviewStore.getState().reset()
      }
      setScreen('youtube')
    } catch {
      setLoadError('Failed to load segments file.')
    }
  }

  async function handlePendingRedownload() {
    if (!pendingRestore) return
    const { type, rawJson, filePath, youtubeUrl } = pendingRestore
    setPendingRestore(null)
    setTab('youtube')
    setYtUrl(youtubeUrl)
    setYtDownloading(true)
    setYtStatus('Starting download...')
    cancelRef.current = false
    try {
      const downloadsDir = await window.api.files.getDownloadsDir()
      const ytDir = `${downloadsDir}/yt-${Date.now()}`
      const { filePath: newVideoPath } = await window.api.youtube.download(youtubeUrl, ytDir)
      if (cancelRef.current) return
      refreshDownloads()
      const data = JSON.parse(rawJson)
      data.videoPath = newVideoPath
      if (type === 'clips') await loadClipsFile(JSON.stringify(data), filePath)
      else await loadSegmentsFile(JSON.stringify(data), filePath)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setYtDownloading(false)
      setYtStatus('')
    }
  }

  async function loadProject(rawJson: string, projectFilePath: string) {
    try {
      const project = JSON.parse(rawJson)
      const videoExists = await window.api.files.exists(project.videoPath)
      if (!videoExists) {
        const label = project.audioOnly ? 'Audio' : 'Video'
        setLoadError(`${label} not found: "${project.videoPath.split(/[/\\]/).pop()}". Please locate it below.`)
        const newVideoPath = project.audioOnly
          ? await window.api.files.openAudio()
          : await window.api.files.openAny()
        if (!newVideoPath || newVideoPath.endsWith('.lecturesubs')) {
          setLoadError(`Could not locate ${label.toLowerCase()} — project not loaded.`)
          return
        }
        setProject({ ...project, videoPath: newVideoPath, projectFilePath })
        setLoadError(null)
        return
      }
      setProject({ ...project, projectFilePath })
      if (project.reviewIssues?.length) {
        useReviewStore.getState().setIssues(project.reviewIssues)
        useReviewStore.getState().setStatus('done')
      } else {
        useReviewStore.getState().reset()
      }
    } catch {
      setLoadError('Failed to load project file.')
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'lecturesubs') {
      const filePath = window.api.getFilePath(file)
      const raw = await window.api.files.readFile(filePath)
      await loadProject(raw, filePath)
      return
    }
    if (ext === 'lectureclips') {
      const filePath = window.api.getFilePath(file)
      const raw = await window.api.files.readFile(filePath)
      await loadClipsFile(raw, filePath)
      return
    }
    if (ext === 'lecturesegments') {
      const filePath = window.api.getFilePath(file)
      const raw = await window.api.files.readFile(filePath)
      await loadSegmentsFile(raw, filePath)
      return
    }
    const videoExts = ['mp4', 'mov', 'mkv', 'webm', 'avi']
    const audioExts = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus']
    const allowed = audioOnly ? [...videoExts, ...audioExts] : videoExts
    if (!allowed.includes(ext)) {
      setLoadError(`Unsupported file type: .${ext}`)
      return
    }
    const isAudio = audioExts.includes(ext)
    await loadVideo(window.api.getFilePath(file), undefined, undefined, isAudio || audioOnly)
  }, [setProject, loadVideo, audioOnly])

  async function handleBrowse() {
    if (audioOnly) {
      const filePath = await window.api.files.openAudio()
      if (filePath) await loadVideo(filePath, undefined, undefined, true)
      return
    }
    const filePath = await window.api.files.openAny()
    if (!filePath) return
    if (filePath.endsWith('.lecturesubs')) {
      const raw = await window.api.files.readFile(filePath)
      await loadProject(raw, filePath)
    } else if (filePath.endsWith('.lectureclips')) {
      const raw = await window.api.files.readFile(filePath)
      await loadClipsFile(raw, filePath)
    } else if (filePath.endsWith('.lecturesegments')) {
      const raw = await window.api.files.readFile(filePath)
      await loadSegmentsFile(raw, filePath)
    } else {
      await loadVideo(filePath)
    }
  }

  async function handleStart() {
    if (!videoInfo) return
    setScreen('processing')
    setProcessing({
      stage: 'extracting',
      stageProgress: 0,
      log: [`Loading: ${videoInfo.name}`],
      videoPath: videoInfo.path,
      audioOnly,
      youtubeUrl: loadedYoutubeUrl,
    })
  }

  const durationHours = (videoInfo?.duration ?? 0) / 3600
  const costProPerHr = 1.5
  const costFlashPerHr = 0.20
  const rate = settings.model === 'gemini-2.5-pro' ? costProPerHr : costFlashPerHr
  const estimatedCost = (durationHours * rate).toFixed(2)
  const isLong = durationHours > 3

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(220,15%,22%)]">
        <span className="text-lg font-semibold tracking-tight">LectureSubs</span>
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-sm text-[hsl(215,15%,55%)] hover:text-white transition-colors px-3 py-1 rounded hover:bg-[hsl(222,20%,18%)]"
        >
          Settings
        </button>
      </div>

      {/* Recovery banner */}
      {recovery && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-900/40 border-b border-amber-700/50 text-amber-300 text-sm">
          <span>⚠ Interrupted transcription recovered — {recovery.cueCount} cues from "{recovery.videoPath.split(/[/\\]/).pop()}"</span>
          <button
            onClick={() => {
              try {
                const data = JSON.parse(recovery.raw)
                const cues = (data.segments as { start_seconds: number; end_seconds: number; arabic: string; english: string }[]).map((s) => ({
                  id: uuidv4(),
                  startSeconds: s.start_seconds,
                  endSeconds: s.end_seconds,
                  arabic: s.arabic,
                  english: s.english,
                }))
                setProject({ videoPath: data.videoPath, audioPath: '', durationSeconds: data.durationSeconds ?? 0, cues, history: [], future: [], createdAt: Date.now(), audioOnly: data.audioOnly })
                window.api.files.clearRecovery()
                setRecovery(null)
              } catch {}
            }}
            className="ml-auto px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium"
          >
            Open in Editor
          </button>
          <button
            onClick={() => { window.api.files.clearRecovery(); setRecovery(null) }}
            className="text-amber-500 hover:text-amber-300 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">

        {/* Loaded video info */}
        {videoInfo && (
          <div className="w-full max-w-xl border border-[hsl(220,15%,30%)] bg-[hsl(222,20%,14%)] rounded-xl p-6 text-center space-y-2">
            <div className="text-2xl">🎬</div>
            <div className="font-medium text-[hsl(210,20%,90%)] truncate">{videoInfo.name}</div>
            <div className="text-sm text-[hsl(215,15%,55%)]">Duration: {formatDuration(videoInfo.duration)}</div>
            {settings.showCostEstimate && (
              <div className="text-sm text-[hsl(215,15%,55%)]">Estimated cost: ~${estimatedCost} ({settings.model})</div>
            )}
            {isLong && (
              <div className="mt-2 px-3 py-2 bg-amber-900/30 border border-amber-700/50 rounded text-amber-400 text-xs">
                Long video ({Math.round(durationHours * 10) / 10}h) — will take ~{Math.ceil(durationHours * 4)} min
              </div>
            )}
            <button onClick={() => setVideoInfo(null)} className="mt-1 text-xs text-[hsl(215,15%,50%)] hover:text-white underline">
              Remove
            </button>
          </div>
        )}

        {/* Tabs — only shown when no video loaded */}
        {!videoInfo && (
          <div className="w-full max-w-xl flex flex-col gap-4">
            <div className="flex rounded-lg border border-[hsl(220,15%,22%)] overflow-hidden">
              <button
                onClick={() => setTab('file')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'file' ? 'bg-[hsl(222,20%,18%)] text-white' : 'text-[hsl(215,15%,50%)] hover:text-white'}`}
              >
                File
              </button>
              <button
                onClick={() => setTab('youtube')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'youtube' ? 'bg-[hsl(222,20%,18%)] text-white' : 'text-[hsl(215,15%,50%)] hover:text-white'}`}
              >
                YouTube URL
              </button>
            </div>

            {tab === 'file' ? (
              <div className="flex flex-col gap-3">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onClick={handleBrowse}
                  className={`
                    w-full border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
                    ${dragging
                      ? 'border-[hsl(210,80%,55%)] bg-[hsl(210,80%,55%,0.08)]'
                      : 'border-[hsl(220,15%,28%)] hover:border-[hsl(220,15%,40%)] hover:bg-[hsl(222,20%,13%)]'}
                  `}
                >
                  <div className="space-y-3">
                    <div className="text-4xl opacity-40">{audioOnly ? '🎵' : '📹'}</div>
                    <div className="text-[hsl(210,20%,80%)] font-medium">
                      {audioOnly ? 'Drop audio here or click to browse' : 'Drop video here or click to browse'}
                    </div>
                    <div className="text-sm text-[hsl(215,15%,50%)]">
                      {audioOnly
                        ? 'MP3, WAV, M4A, AAC, FLAC, OGG · or video files'
                        : 'MP4, MOV, MKV, WebM, AVI · .lecturesubs · .lectureclips · .lecturesegments'}
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div
                    onClick={() => { setAudioOnly((v) => !v); setVideoInfo(null); setLoadError(null) }}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${audioOnly ? 'bg-[hsl(210,80%,55%)]' : 'bg-[hsl(220,15%,28%)]'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${audioOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-[hsl(215,15%,55%)]">Audio only upload</span>
                  {audioOnly && <span className="text-xs text-[hsl(215,15%,40%)]">— set a background image in Settings</span>}
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !ytDownloading) handleYouTubeDownload() }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={ytDownloading}
                    className="flex-1 bg-[hsl(222,20%,18%)] border border-[hsl(220,15%,25%)] rounded-lg px-3 py-2 text-sm text-[hsl(210,20%,90%)] placeholder:text-[hsl(215,15%,35%)] focus:outline-none focus:border-[hsl(210,80%,55%)] disabled:opacity-50"
                  />
                  {ytDownloading ? (
                    <button
                      onClick={handleYouTubeCancel}
                      className="px-4 py-2 text-sm rounded-lg bg-red-700 hover:bg-red-600 text-white font-medium"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={handleYouTubeDownload}
                      disabled={!ytUrl.trim()}
                      className="px-4 py-2 text-sm rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium disabled:opacity-40"
                    >
                      Download
                    </button>
                  )}
                </div>

                {ytDownloading && (
                  <div className="flex items-center gap-2.5 text-xs text-[hsl(215,15%,50%)]">
                    <div className="w-3.5 h-3.5 border-2 border-[hsl(210,80%,55%)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span className="truncate">{ytStatus || 'Downloading...'}</span>
                  </div>
                )}

                {downloads.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-[hsl(215,15%,40%)] uppercase tracking-wide">Previously downloaded</p>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <div
                          onClick={() => setAudioOnly((v) => !v)}
                          className={`relative w-7 h-4 rounded-full transition-colors flex-shrink-0 ${audioOnly ? 'bg-[hsl(210,80%,55%)]' : 'bg-[hsl(220,15%,28%)]'}`}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${audioOnly ? 'translate-x-3' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-[10px] text-[hsl(215,15%,45%)]">Audio only</span>
                      </label>
                    </div>
                    {downloads.map((d) => (
                      <div key={d.path} className="flex items-center gap-1 group">
                        <button
                          onClick={() => loadVideo(d.path, d.name, d.url, audioOnly || undefined)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(220,15%,22%)] bg-[hsl(222,20%,13%)] hover:border-[hsl(220,15%,35%)] hover:bg-[hsl(222,20%,16%)] text-left transition-colors min-w-0"
                        >
                          <span className="text-base flex-shrink-0">{audioOnly ? '🎵' : '🎬'}</span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-[hsl(210,20%,80%)] truncate">{d.name}</span>
                            <span className="text-[10px] text-[hsl(215,15%,40%)]">{new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                        </button>
                        <button
                          onClick={async (e) => { e.stopPropagation(); await window.api.files.deleteDownload(d.path); refreshDownloads() }}
                          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-[hsl(215,15%,40%)] hover:text-red-400 hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {pendingRestore && (
          <div className="w-full max-w-xl px-4 py-4 bg-amber-900/25 border border-amber-700/40 rounded-lg flex flex-col gap-3">
            <p className="text-sm text-amber-300 font-medium">Video file not found on this machine</p>
            <p className="text-xs text-amber-400/70">This {pendingRestore.type === 'clips' ? 'clips' : 'segments'} file was originally made from a YouTube video. Re-download it to continue, or locate it manually.</p>
            <div className="flex gap-2">
              <button
                onClick={handlePendingRedownload}
                disabled={ytDownloading}
                className="px-3 py-1.5 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white font-medium disabled:opacity-40"
              >
                {ytDownloading ? 'Downloading...' : 'Re-download from YouTube'}
              </button>
              <button
                onClick={async () => {
                  const picked = await window.api.files.openAny()
                  if (!picked) return
                  const data = JSON.parse(pendingRestore.rawJson)
                  data.videoPath = picked
                  setPendingRestore(null)
                  if (pendingRestore.type === 'clips') await loadClipsFile(JSON.stringify(data), pendingRestore.filePath)
                  else await loadSegmentsFile(JSON.stringify(data), pendingRestore.filePath)
                }}
                className="px-3 py-1.5 text-xs rounded border border-amber-700/50 text-amber-400 hover:text-white hover:border-amber-600"
              >
                Browse for file
              </button>
              <button onClick={() => setPendingRestore(null)} className="ml-auto text-xs text-amber-600 hover:text-amber-400">Dismiss</button>
            </div>
          </div>
        )}

        {loadError && (
          <div className="w-full max-w-xl px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
            {loadError}
          </div>
        )}

        {/* Start button */}
        <div className="relative group">
          <button
            onClick={handleStart}
            disabled={!videoInfo || !hasApiKey || !hasGroqKey || !!groqQuotaExhaustedAt}
            className="px-8 py-3 rounded-lg font-semibold text-base transition-all
              bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[hsl(210,80%,55%)]"
          >
            Transcribe &amp; Translate
          </button>
          {(!hasApiKey || !hasGroqKey || !!groqQuotaExhaustedAt) && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[hsl(222,20%,20%)] border border-[hsl(220,15%,30%)] text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {groqQuotaExhaustedAt ? 'Groq quota exhausted — wait for the timer to clear' : !hasApiKey ? 'Add your Gemini API key in Settings' : 'Add your Groq API key in Settings'}
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
