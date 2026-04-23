import { useState, useRef, useEffect } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useClipsStore } from '../state/clipsStore'
import { useReviewStore } from '../state/reviewStore'
import SubtitleStyleBar from './SubtitleStyleBar'
import ReviewPanel from './ReviewPanel'
import { serializeSrt, formatDuration, runScrutinize } from '../utils'
import type { Clip, Cue } from '../types'

const FONT_SIZE_PX: Record<string, number> = { small: 14, medium: 18, large: 22, xl: 30, xxl: 40 }

export default function ClipsScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const project = useProjectStore((s) => s.project)
  const { clips, detecting, error, isDirty, savedFilePath, returnScreen, markSaved, toggleClip, selectAll, deselectAll, updateClipCue } = useClipsStore()
  const selected = clips.filter((c) => c.selected)
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
      const issues = await runScrutinize(clips.flatMap((clip) => clip.cues.map((c) => ({ id: c.id, arabic: c.arabic ?? '', english: c.english }))))
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
    for (const clip of clips) {
      const cue = clip.cues.find((c) => c.id === id)
      if (cue) return cue
    }
  }

  function applyFix(cueId: string, patch: { arabic?: string; english?: string }) {
    for (const clip of clips) {
      if (clip.cues.some((c) => c.id === cueId)) {
        updateClipCue(clip.id, cueId, patch)
        return
      }
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const defaultName = project?.videoPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'clips'
      const savePath = savedFilePath ?? await window.api.files.saveFile({
        defaultPath: `${defaultName}.lectureclips`,
        filters: [{ name: 'LectureSubs Clips', extensions: ['lectureclips'] }],
      })
      if (!savePath) return
      const data = JSON.stringify({
        version: 1,
        videoPath: project?.videoPath,
        projectFilePath: project?.projectFilePath ?? null,
        youtubeUrl: project?.youtubeUrl ?? null,
        clips,
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
    const toExport = clips.filter((c) => c.selected)
    if (!toExport.length) return

    const baseFolder = await window.api.files.pickFolder()
    if (!baseFolder) return

    const videoName = useProjectStore.getState().project?.videoPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'clips'
    const safeName = videoName.replace(/[^a-z0-9]/gi, '_').slice(0, 40)
    const folder = `${baseFolder}/Clips - ${safeName}`
    await window.api.files.mkdir(folder)
    setExporting(true)
    setExportError(null)

    try {
      const tmpDir = await window.api.files.getTmpDir()
      for (let i = 0; i < toExport.length; i++) {
        const clip = toExport[i]
        const srtContent = serializeSrt(clip.cues, false)
        const srtPath = `${tmpDir}/clip_${i}.srt`
        await window.api.files.writeFile(srtPath, srtContent)

        const safeName = clip.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40)
        const outputPath = `${folder}${safeName}_${i + 1}.mp4`

        const logo = useProjectStore.getState().logoSettings
        const style = useProjectStore.getState().subtitleStyle
        await window.api.ffmpeg.exportClip(
          useProjectStore.getState().project!.videoPath,
          srtPath,
          clip.startSeconds,
          clip.endSeconds - clip.startSeconds,
          outputPath,
          {
            fontSize: FONT_SIZE_PX[style.fontSize] ?? 18,
            position: style.position,
            background: style.background,
            ...(logo.enabled && logo.path ? { logoPath: logo.path, logoPosition: logo.position, logoSize: logo.size, logoOpacity: logo.opacity } : {}),
          }
        )
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
        <p className="text-[hsl(215,15%,55%)] text-sm">Analyzing transcript for clip-worthy moments...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={() => setScreen(returnScreen)} className="text-sm text-[hsl(215,15%,55%)] hover:text-white">
          ← Back to Editor
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
          <span className="text-sm font-medium">Intelligent Clips</span>
          <span className="text-xs text-[hsl(215,15%,45%)]">{clips.length} clips found</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-xs text-[hsl(215,15%,50%)] hover:text-white px-2 py-1">Select all</button>
          <button onClick={deselectAll} className="text-xs text-[hsl(215,15%,50%)] hover:text-white px-2 py-1">None</button>
          <button
            onClick={handleReview}
            className="relative px-3 py-1.5 text-sm rounded border border-[hsl(220,15%,30%)] text-[hsl(210,20%,80%)] hover:text-white hover:border-[hsl(220,15%,45%)] transition-colors"
          >
            {reviewStore.status === 'analyzing' ? 'Reviewing...' : 'Review'}
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
            {saving ? 'Saving...' : isDirty ? 'Save clips' : 'Saved'}
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
                {exporting ? 'Exporting...' : `Export ${selected.length} clip${selected.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {showBackWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[hsl(222,20%,14%)] border border-[hsl(220,15%,22%)] rounded-xl p-6 w-[400px] shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-semibold">Unsaved clips</h3>
            <p className="text-sm text-[hsl(215,15%,60%)] leading-relaxed">
              These clips haven't been saved. If you go back and regenerate clips later, the AI will produce different results — you'll lose these specific clips.
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

      {/* Clips grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-4">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      </div>

      {reviewStore.open && (
        <ReviewPanel
          videoPath={project?.videoPath ?? ''}
          getAbsoluteTime={(cueId) => {
            for (const clip of clips) {
              const cue = clip.cues.find((c) => c.id === cueId)
              if (cue) return clip.startSeconds + cue.startSeconds
            }
          }}
          onClose={() => reviewStore.setOpen(false)}
          onRerun={() => { reviewStore.reset(); handleReview() }}
          getCue={getCue}
          onApplyFix={applyFix}
          getContext={(cueId) => {
            for (const clip of clips) {
              const idx = clip.cues.findIndex((c) => c.id === cueId)
              if (idx !== -1) return { title: clip.title, cueIndex: idx + 1, totalCues: clip.cues.length }
            }
          }}
          onMarkDirty={() => useClipsStore.getState().markDirty()}
        />
      )}
    </div>
  )
}

function ClipCard({ clip }: { clip: Clip }) {
  const { toggleClip, updateClipCue, mergeClipCues, deleteClipCue, extendClip, trimClip } = useClipsStore()
  const allCues = useProjectStore((s) => s.project?.cues ?? [])
  const project = useProjectStore((s) => s.project)
  const subtitleStyle = useProjectStore((s) => s.subtitleStyle)
  const logo = useProjectStore((s) => s.logoSettings)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [relativeTime, setRelativeTime] = useState(0)

  const duration = clip.endSeconds - clip.startSeconds
  const activeCue = clip.cues.find((c) => relativeTime >= c.startSeconds && relativeTime < c.endSeconds) ?? null

  const FONT_SIZE_CLASS: Record<string, string> = { small: 'text-xs', medium: 'text-sm', large: 'text-base', xl: 'text-xl', xxl: 'text-3xl' }
  const BG_CLASS: Record<string, string> = { none: '', semi: 'bg-black/60', solid: 'bg-black/85' }
  const fontClass = FONT_SIZE_CLASS[subtitleStyle.fontSize] ?? 'text-sm'
  const bgClass = BG_CLASS[subtitleStyle.background] ?? 'bg-black/60'

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = clip.startSeconds

    function tick() {
      if (el!.currentTime >= clip.endSeconds) {
        el!.pause()
        el!.currentTime = clip.startSeconds
        setPlaying(false)
        setRelativeTime(0)
      } else {
        setRelativeTime(Math.max(0, el!.currentTime - clip.startSeconds))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [clip.startSeconds, clip.endSeconds])

  function togglePlay() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { el.play(); setPlaying(true) }
    else { el.pause(); setPlaying(false) }
  }

  const videoSrc = project?.videoPath.startsWith('/')
    ? `file://${encodeURI(project.videoPath)}`
    : project?.videoPath ?? ''

  return (
    <div className={`flex flex-col rounded-lg border transition-colors ${clip.selected ? 'border-[hsl(210,60%,45%)] bg-[hsl(222,20%,14%)]' : 'border-[hsl(220,15%,22%)] bg-[hsl(222,20%,12%)]'}`}>
      {/* 9:16 video preview */}
      <div className="relative cursor-pointer" style={{ aspectRatio: '9/16', overflow: 'hidden', borderRadius: '0.5rem 0.5rem 0 0' }} onClick={togglePlay}>
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
              if (videoRef.current) videoRef.current.currentTime = clip.startSeconds + t
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
            src={`file://${logo.path}`}
            className={`absolute pointer-events-none ${
              logo.size === 'small' ? 'w-[10%]' : logo.size === 'large' ? 'w-[22%]' : 'w-[15%]'
            } ${
              logo.position === 'top-left' ? 'top-2 left-2' :
              logo.position === 'top-right' ? 'top-2 right-2' :
              logo.position === 'bottom-left' ? 'bottom-10 left-2' : 'bottom-10 right-2'
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
          onClick={(e) => { e.stopPropagation(); toggleClip(clip.id) }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold transition-colors ${clip.selected ? 'bg-[hsl(210,80%,55%)] border-[hsl(210,80%,55%)] text-white' : 'bg-black/50 border-white/50'}`}>
            {clip.selected ? '✓' : ''}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-2 flex flex-col gap-1">
        <p className="text-sm font-medium leading-tight">{clip.title}</p>
        <p className="text-xs text-[hsl(215,15%,50%)] leading-snug">{clip.reason}</p>
      </div>

      {/* Edit subtitles toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mx-3 mb-2 px-2 py-1 text-xs rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-white hover:border-[hsl(220,15%,35%)] transition-colors text-left"
      >
        {expanded ? '▲ Hide subtitles' : `▼ Edit subtitles (${clip.cues.length})`}
      </button>

      {/* Extend / trim controls */}
      {allCues.length === 0 ? (
        <p className="mx-3 mb-2 text-[10px] text-[hsl(215,15%,38%)] italic">
          Open via .lecturesubs to extend or trim clip boundaries
        </p>
      ) : (
        <div className="mx-3 mb-2 grid grid-cols-2 gap-1">
          <button
            onClick={() => extendClip(clip.id, 'start', allCues)}
            title="Prepend one cue before clip start"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-green-400 hover:border-green-700 transition-colors"
          >
            ← +cue start
          </button>
          <button
            onClick={() => extendClip(clip.id, 'end', allCues)}
            title="Append one cue after clip end"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-green-400 hover:border-green-700 transition-colors"
          >
            +cue end →
          </button>
          <button
            onClick={() => trimClip(clip.id, 'start')}
            title="Remove first cue"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-red-400 hover:border-red-800 transition-colors"
          >
            → −cue start
          </button>
          <button
            onClick={() => trimClip(clip.id, 'end')}
            title="Remove last cue"
            className="px-2 py-1 text-[10px] rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-red-400 hover:border-red-800 transition-colors"
          >
            −cue end ←
          </button>
        </div>
      )}

      {expanded && (
        <div className="mx-3 mb-3 max-h-72 overflow-y-auto flex flex-col gap-1.5">
          {clip.cues.map((cue, idx) => (
            <ClipCueRow
              key={cue.id}
              cue={cue}
              isLast={idx === clip.cues.length - 1}
              onUpdate={(patch) => updateClipCue(clip.id, cue.id, patch)}
              onMerge={() => mergeClipCues(clip.id, cue.id)}
              onDelete={() => deleteClipCue(clip.id, cue.id)}
              onSeek={() => { if (videoRef.current) { videoRef.current.currentTime = clip.startSeconds + cue.startSeconds } }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ClipCueRow({ cue, isLast, onUpdate, onMerge, onDelete, onSeek }: {
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
