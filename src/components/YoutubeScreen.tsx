import { useState, useRef, useEffect } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useSegmentsStore } from '../state/segmentsStore'
import { useReviewStore } from '../state/reviewStore'
import SubtitleStyleBar from './SubtitleStyleBar'
import ReviewPanel from './ReviewPanel'
import { serializeSrt, formatDuration, runScrutinize, toFileUrl } from '../utils'
import type { VideoSegment, Cue } from '../types'

const FONT_SIZE_PX: Record<string, number> = { small: 14, medium: 18, large: 22, xl: 30, xxl: 40 }

export default function YoutubeScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const project = useProjectStore((s) => s.project)
  const { segments, detecting, error, isDirty, savedFilePath, returnScreen, markSaved, toggleSegment, selectAll, deselectAll, updateSegmentCue } = useSegmentsStore()
  const selected = segments.filter((s) => s.selected)
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showBackWarning, setShowBackWarning] = useState(false)
  const reviewStore = useReviewStore()

  async function handleReview() {
    const currentStatus = useReviewStore.getState().status
    if (currentStatus === 'done' || currentStatus === 'analyzing') { reviewStore.setOpen(true); return }
    const sid = reviewStore.startSession()
    reviewStore.setOpen(true)
    reviewStore.setStatus('analyzing')
    try {
      const issues = await runScrutinize(
        segments.flatMap((seg) => seg.cues.map((c) => ({ id: c.id, arabic: c.arabic ?? '', english: c.english }))),
        (cur, total) => { if (useReviewStore.getState().sessionId === sid) reviewStore.setBatchProgress(cur, total) }
      )
      if (useReviewStore.getState().sessionId !== sid) return
      reviewStore.setIssues(issues)
      reviewStore.setStatus('done')
    } catch (err) {
      if (useReviewStore.getState().sessionId !== sid) return
      reviewStore.setError(err instanceof Error ? err.message : String(err))
      reviewStore.setStatus('error')
    }
  }

  function getCue(id: string) {
    for (const seg of segments) {
      const cue = seg.cues.find((c) => c.id === id)
      if (cue) return cue
    }
  }

  function applyFix(cueId: string, patch: { arabic?: string; english?: string }) {
    for (const seg of segments) {
      if (seg.cues.some((c) => c.id === cueId)) {
        updateSegmentCue(seg.id, cueId, patch)
        return
      }
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const defaultName = project?.videoPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'segments'
      const savePath = savedFilePath ?? await window.api.files.saveFile({
        defaultPath: `${defaultName}.lecturesegments`,
        filters: [{ name: 'LectureSubs Segments', extensions: ['lecturesegments'] }],
      })
      if (!savePath) return
      const data = JSON.stringify({
        version: 1,
        videoPath: project?.videoPath,
        projectFilePath: project?.projectFilePath ?? null,
        youtubeUrl: project?.youtubeUrl ?? null,
        segments,
        reviewIssues: useReviewStore.getState().issues,
      })
      await window.api.files.writeFile(savePath, data)
      markSaved(savePath)
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (isDirty) {
      setShowBackWarning(true)
    } else {
      reviewStore.reset()
      setScreen(returnScreen)
    }
  }

  async function handleExport() {
    const toExport = segments.filter((s) => s.selected)
    if (!toExport.length) return

    const baseFolder = await window.api.files.pickFolder()
    if (!baseFolder) return

    const videoName = useProjectStore.getState().project?.videoPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'segments'
    const safeFolderName = videoName.replace(/[^a-z0-9]/gi, '_').slice(0, 40)
    const folder = `${baseFolder}/Segments - ${safeFolderName}`
    await window.api.files.mkdir(folder)
    setExporting(true)
    setExportError(null)

    try {
      const tmpDir = await window.api.files.getTmpDir()
      const introVideoPath = useProjectStore.getState().introVideoPath
      const hasIntro = !!(introVideoPath && await window.api.files.exists(introVideoPath))

      for (let i = 0; i < toExport.length; i++) {
        const seg = toExport[i]
        const srtContent = serializeSrt(seg.cues, false)
        const srtPath = `${tmpDir}/seg_${i}.srt`
        await window.api.files.writeFile(srtPath, srtContent)

        const safeTitle = seg.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40)
        const outputPath = `${folder}/${String(i + 1).padStart(2, '0')}_${safeTitle}.mp4`
        const mainPath = hasIntro ? `${tmpDir}/seg_${i}_main.mp4` : outputPath

        const logo = useProjectStore.getState().logoSettings
        const style = useProjectStore.getState().subtitleStyle
        await window.api.ffmpeg.exportSegment(
          useProjectStore.getState().project!.videoPath,
          srtPath,
          seg.startSeconds,
          seg.endSeconds - seg.startSeconds,
          mainPath,
          {
            fontSize: FONT_SIZE_PX[style.fontSize] ?? 22,
            position: style.position,
            background: style.background,
            ...(logo.enabled && logo.path ? { logoPath: logo.path, logoPosition: logo.position, logoSize: logo.size, logoOpacity: logo.opacity } : {}),
          }
        )

        if (hasIntro) {
          await window.api.ffmpeg.prependIntro(introVideoPath!, mainPath, outputPath)
        }
      }
      setExportDone(true)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  if (detecting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-[hsl(210,80%,55%)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[hsl(215,15%,55%)] text-sm">Analyzing lecture and splitting into YouTube segments...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={() => setScreen(returnScreen)} className="text-sm text-[hsl(215,15%,55%)] hover:text-white">
          ← Back
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(220,15%,22%)] bg-[hsl(222,20%,12%)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="text-[hsl(215,15%,50%)] hover:text-white text-sm">
            ← Back
          </button>
          <span className="text-sm font-medium">YouTube Segments</span>
          <span className="text-xs text-[hsl(215,15%,45%)]">{segments.length} segments</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-xs text-[hsl(215,15%,50%)] hover:text-white px-2 py-1">Select all</button>
          <button onClick={deselectAll} className="text-xs text-[hsl(215,15%,50%)] hover:text-white px-2 py-1">None</button>
          <button
            onClick={handleReview}
            className="relative px-3 py-1.5 text-sm rounded border border-[hsl(220,15%,30%)] text-[hsl(210,20%,80%)] hover:text-white hover:border-[hsl(220,15%,45%)] transition-colors"
          >
            {reviewStore.status === 'analyzing'
              ? reviewStore.batchProgress
                ? `Reviewing ${reviewStore.batchProgress.current}/${reviewStore.batchProgress.total}...`
                : 'Reviewing...'
              : 'Review'}
            {reviewStore.status === 'done' && reviewStore.issues.filter((i) => i.status === 'pending').length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center font-bold">
                {reviewStore.issues.filter((i) => i.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-3 py-1.5 text-sm rounded border border-[hsl(220,15%,30%)] text-[hsl(210,20%,80%)] hover:text-white hover:border-[hsl(220,15%,45%)] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : isDirty ? 'Save segments' : 'Saved'}
          </button>
          {exportDone ? (
            <span className="text-xs text-green-400 px-3">Exported!</span>
          ) : (
            <div className="flex items-center gap-2">
              {reviewStore.status !== 'done' && reviewStore.issues.length === 0 && (
                <span className="text-[11px] text-amber-400/80" title="Run a review before exporting to catch transcription or translation issues">
                  ⚠ Not reviewed
                </span>
              )}
              <button
                onClick={handleExport}
                disabled={exporting || selected.length === 0}
                className="px-4 py-1.5 text-sm rounded bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {exporting ? 'Exporting...' : `Export ${selected.length} segment${selected.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {showBackWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[hsl(222,20%,14%)] border border-[hsl(220,15%,22%)] rounded-xl p-6 w-[400px] shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-semibold">Unsaved segments</h3>
            <p className="text-sm text-[hsl(215,15%,60%)] leading-relaxed">
              These segments haven't been saved. If you go back and regenerate later, the AI will produce different results.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowBackWarning(false)}
                className="px-4 py-2 text-sm rounded-lg bg-[hsl(222,20%,22%)] hover:bg-[hsl(222,20%,28%)] text-white"
              >
                Stay
              </button>
              <button
                onClick={async () => { await handleSave(); setShowBackWarning(false) }}
                className="px-4 py-2 text-sm rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium"
              >
                Save then go back
              </button>
              <button
                onClick={() => { reviewStore.reset(); setShowBackWarning(false); setScreen(returnScreen) }}
                className="px-4 py-2 text-sm rounded-lg text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <SubtitleStyleBar />

      {exportError && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-700/40 text-red-400 text-xs flex-shrink-0">
          {exportError}
        </div>
      )}

      {/* Segments grid — 2 columns for 16:9 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-4">
          {segments.map((seg) => (
            <SegmentCard key={seg.id} segment={seg} />
          ))}
        </div>
      </div>

      {reviewStore.open && (
        <ReviewPanel
          videoPath={project?.videoPath ?? ''}
          getAbsoluteTime={(cueId) => {
            for (const seg of segments) {
              const cue = seg.cues.find((c) => c.id === cueId)
              if (cue) return seg.startSeconds + cue.startSeconds
            }
          }}
          onClose={() => reviewStore.setOpen(false)}
          onRerun={() => { reviewStore.reset(); handleReview() }}
          getCue={getCue}
          onApplyFix={applyFix}
          getContext={(cueId) => {
            for (const seg of segments) {
              const idx = seg.cues.findIndex((c) => c.id === cueId)
              if (idx !== -1) return { title: seg.title, cueIndex: idx + 1, totalCues: seg.cues.length }
            }
          }}
          onMarkDirty={() => useSegmentsStore.getState().markDirty()}
        />
      )}
    </div>
  )
}

function SegmentCard({ segment }: { segment: VideoSegment }) {
  const { toggleSegment, updateSegmentCue, mergeSegmentCues, deleteSegmentCue, extendSegment, trimSegment } = useSegmentsStore()
  const allCues = useProjectStore((s) => s.project?.cues ?? [])
  const project = useProjectStore((s) => s.project)
  const subtitleStyle = useProjectStore((s) => s.subtitleStyle)
  const logo = useProjectStore((s) => s.logoSettings)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [relativeTime, setRelativeTime] = useState(0)

  const duration = segment.endSeconds - segment.startSeconds
  const activeCue = segment.cues.find((c) => relativeTime >= c.startSeconds && relativeTime < c.endSeconds) ?? null

  const FONT_SIZE_CLASS: Record<string, string> = { small: 'text-xs', medium: 'text-sm', large: 'text-base', xl: 'text-xl', xxl: 'text-3xl' }
  const BG_CLASS: Record<string, string> = { none: '', semi: 'bg-black/60', solid: 'bg-black/85' }
  const fontClass = FONT_SIZE_CLASS[subtitleStyle.fontSize] ?? 'text-sm'
  const bgClass = BG_CLASS[subtitleStyle.background] ?? 'bg-black/60'

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = segment.startSeconds

    function tick() {
      if (el!.currentTime >= segment.endSeconds) {
        el!.pause()
        el!.currentTime = segment.startSeconds
        setPlaying(false)
        setRelativeTime(0)
      } else {
        setRelativeTime(Math.max(0, el!.currentTime - segment.startSeconds))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [segment.startSeconds, segment.endSeconds])

  function togglePlay() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { el.play(); setPlaying(true) }
    else { el.pause(); setPlaying(false) }
  }

  const videoSrc = toFileUrl(project?.videoPath ?? '')

  return (
    <div className={`flex flex-col rounded-lg border transition-colors ${segment.selected ? 'border-[hsl(210,60%,45%)] bg-[hsl(222,20%,14%)]' : 'border-[hsl(220,15%,22%)] bg-[hsl(222,20%,12%)]'}`}>
      {/* 16:9 video preview */}
      <div className="relative cursor-pointer" style={{ aspectRatio: '16/9', overflow: 'hidden', borderRadius: '0.5rem 0.5rem 0 0' }} onClick={togglePlay}>
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full h-full"
          style={{ objectFit: 'cover' }}
          preload="metadata"
          muted={false}
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white text-lg">▶</div>
          </div>
        )}

        {/* Scrubber */}
        <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 bg-gradient-to-t from-black/70 to-transparent" onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={relativeTime}
            onChange={(e) => {
              const t = parseFloat(e.target.value)
              setRelativeTime(t)
              if (videoRef.current) videoRef.current.currentTime = segment.startSeconds + t
            }}
            className="w-full h-1 accent-[hsl(210,80%,55%)]"
          />
        </div>

        {/* Subtitle overlay */}
        {activeCue && (
          <div className={`absolute left-0 right-0 flex justify-center pointer-events-none px-2 ${
            subtitleStyle.position === 'top' ? 'top-8' :
            subtitleStyle.position === 'center' ? 'top-[42%] -translate-y-1/2' :
            'bottom-8'
          }`}>
            <div className="text-center space-y-0.5 max-w-full">
              {subtitleStyle.includeArabic && activeCue.arabic && (
                <div className={`${fontClass} ${bgClass} text-white px-1.5 py-0.5 rounded text-center`} dir="rtl">{activeCue.arabic}</div>
              )}
              <div className={`${fontClass} ${bgClass} text-white px-1.5 py-0.5 rounded text-center`}
                style={subtitleStyle.background === 'none' ? { textShadow: '0 1px 3px #000' } : undefined}>
                {activeCue.english}
              </div>
            </div>
          </div>
        )}
        {logo.enabled && logo.path && (
          <img
            src={toFileUrl(logo.path)}
            className={`absolute pointer-events-none ${
              logo.size === 'small' ? 'w-[8%]' : logo.size === 'large' ? 'w-[18%]' : 'w-[12%]'
            } ${
              logo.position === 'top-left' ? 'top-2 left-2' :
              logo.position === 'top-right' ? 'top-2 right-2' :
              logo.position === 'bottom-left' ? 'bottom-8 left-2' : 'bottom-8 right-2'
            }`}
            style={{ opacity: (logo.opacity ?? 100) / 100 }}
            alt=""
          />
        )}
        {/* Duration badge */}
        <div className="absolute bottom-8 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
          {formatDuration(duration)}
        </div>
        {/* Current timestamp */}
        <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none">
          {String(Math.floor(relativeTime / 60)).padStart(2, '0')}:{String(Math.floor(relativeTime % 60)).padStart(2, '0')}
        </div>
        {/* Selected checkbox */}
        <div
          className="absolute top-2 left-2"
          onClick={(e) => { e.stopPropagation(); toggleSegment(segment.id) }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold transition-colors ${segment.selected ? 'bg-[hsl(210,80%,55%)] border-[hsl(210,80%,55%)] text-white' : 'bg-black/50 border-white/50'}`}>
            {segment.selected ? '✓' : ''}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-2 flex flex-col gap-1">
        <p className="text-sm font-medium leading-tight">{segment.title}</p>
        <p className="text-xs text-[hsl(215,15%,50%)] leading-snug">{segment.topicSummary}</p>
      </div>

      {/* Edit subtitles toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mx-3 mb-2 px-2 py-1 text-xs rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-white hover:border-[hsl(220,15%,35%)] transition-colors text-left"
      >
        {expanded ? '▲ Hide subtitles' : `▼ Edit subtitles (${segment.cues.length})`}
      </button>

      {/* Extend / trim controls */}
      {allCues.length === 0 ? (
        <p className="mx-3 mb-2 text-[10px] text-[hsl(215,15%,38%)] italic">
          Open via .lecturesubs to extend or trim segment boundaries
        </p>
      ) : (
        <div className="mx-3 mb-2 grid grid-cols-2 gap-1">
          <button
            onClick={() => extendSegment(segment.id, 'start', allCues)}
            title="Prepend one cue before segment start"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-green-400 hover:border-green-700 transition-colors"
          >
            ← +cue start
          </button>
          <button
            onClick={() => extendSegment(segment.id, 'end', allCues)}
            title="Append one cue after segment end"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-green-400 hover:border-green-700 transition-colors"
          >
            +cue end →
          </button>
          <button
            onClick={() => trimSegment(segment.id, 'start')}
            title="Remove first cue"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-red-400 hover:border-red-800 transition-colors"
          >
            → −cue start
          </button>
          <button
            onClick={() => trimSegment(segment.id, 'end')}
            title="Remove last cue"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-red-400 hover:border-red-800 transition-colors"
          >
            −cue end ←
          </button>
        </div>
      )}

      {expanded && (
        <div className="mx-3 mb-3 max-h-72 overflow-y-auto flex flex-col gap-1.5">
          {segment.cues.map((cue, idx) => (
            <SegmentCueRow
              key={cue.id}
              cue={cue}
              isLast={idx === segment.cues.length - 1}
              onUpdate={(patch) => updateSegmentCue(segment.id, cue.id, patch)}
              onMerge={() => mergeSegmentCues(segment.id, cue.id)}
              onDelete={() => deleteSegmentCue(segment.id, cue.id)}
              onSeek={() => { if (videoRef.current) { videoRef.current.currentTime = segment.startSeconds + cue.startSeconds } }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SegmentCueRow({ cue, isLast, onUpdate, onMerge, onDelete, onSeek }: {
  cue: Cue
  isLast: boolean
  onUpdate: (patch: Partial<Omit<Cue, 'id'>>) => void
  onMerge: () => void
  onDelete: () => void
  onSeek?: () => void
}) {
  const [editingTime, setEditingTime] = useState(false)
  const [rawStart, setRawStart] = useState('')
  const [rawEnd, setRawEnd] = useState('')
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  const fmt = (s: number) => `${pad(s / 60)}:${pad(s % 60)}`

  function commitTime() {
    const s = parseFloat(rawStart)
    const e = parseFloat(rawEnd)
    if (!isNaN(s)) onUpdate({ startSeconds: s })
    if (!isNaN(e)) onUpdate({ endSeconds: e })
    setEditingTime(false)
  }

  return (
    <div className="flex flex-col gap-1 p-1.5 rounded bg-[hsl(222,20%,16%)] border border-[hsl(220,15%,22%)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {editingTime ? (
            <>
              <input
                autoFocus
                value={rawStart}
                onChange={(e) => setRawStart(e.target.value)}
                onBlur={commitTime}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTime(); if (e.key === 'Escape') setEditingTime(false) }}
                className="w-14 text-[10px] bg-[hsl(222,20%,10%)] border border-[hsl(210,80%,55%)] rounded px-1 text-center text-white font-mono"
              />
              <span className="text-[10px] text-[hsl(215,15%,40%)]">→</span>
              <input
                value={rawEnd}
                onChange={(e) => setRawEnd(e.target.value)}
                onBlur={commitTime}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTime(); if (e.key === 'Escape') setEditingTime(false) }}
                className="w-14 text-[10px] bg-[hsl(222,20%,10%)] border border-[hsl(210,80%,55%)] rounded px-1 text-center text-white font-mono"
              />
            </>
          ) : (
            <>
              <button onClick={onSeek} className="text-[10px] text-[hsl(210,80%,60%)] font-mono hover:text-[hsl(210,80%,75%)] transition-colors" title="Jump to this cue">
                {fmt(cue.startSeconds)} → {fmt(cue.endSeconds)}
              </button>
              <button
                onClick={() => { setRawStart(cue.startSeconds.toFixed(2)); setRawEnd(cue.endSeconds.toFixed(2)); setEditingTime(true) }}
                className="text-[10px] text-[hsl(215,15%,40%)] hover:text-[hsl(210,80%,60%)] transition-colors"
                title="Edit timestamps"
              >✎</button>
            </>
          )}
        </div>
        <div className="flex gap-1">
          {!isLast && (
            <button onClick={onMerge} className="text-xs px-2 py-1 rounded border border-[hsl(220,15%,28%)] text-[hsl(215,15%,50%)] hover:text-white">merge↓</button>
          )}
          <button onClick={onDelete} className="text-xs px-1.5 py-1 rounded border border-[hsl(220,15%,28%)] text-[hsl(215,15%,50%)] hover:text-red-400">×</button>
        </div>
      </div>
      <textarea
        value={cue.arabic}
        onChange={(e) => onUpdate({ arabic: e.target.value })}
        rows={2}
        dir="rtl"
        placeholder="Arabic..."
        className="w-full text-xs bg-transparent border border-[hsl(220,15%,25%)] rounded px-1.5 py-1 text-[hsl(210,20%,75%)] focus:outline-none focus:border-[hsl(210,60%,45%)] resize-none text-right"
      />
      <textarea
        value={cue.english}
        onChange={(e) => onUpdate({ english: e.target.value })}
        rows={2}
        className="w-full text-xs bg-transparent border border-[hsl(220,15%,25%)] rounded px-1.5 py-1 text-[hsl(210,20%,85%)] focus:outline-none focus:border-[hsl(210,60%,45%)] resize-none"
      />
    </div>
  )
}
