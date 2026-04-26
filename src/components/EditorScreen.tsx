import { useState, useRef, useCallback } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useSegmentsStore, buildSegmentsFromSuggestions } from '../state/segmentsStore'
import { useReviewStore } from '../state/reviewStore'
import SubtitleStyleBar from './SubtitleStyleBar'
import { runScrutinize } from '../utils'
import type { SegmentDurationRange } from '../types'
import VideoPreview from './VideoPreview'
import CueList from './CueList'
import SubtitleTimeline from './SubtitleTimeline'
import ExportDialog from './ExportDialog'
import SettingsDialog from './SettingsDialog'
import ReviewPanel from './ReviewPanel'

export default function EditorScreen() {
  const project = useProjectStore((s) => s.project)
  const setScreen = useProjectStore((s) => s.setScreen)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const clearProject = useProjectStore((s) => s.clearProject)
  const updateCue = useProjectStore((s) => s.updateCue)
  const setProjectFilePath = useProjectStore((s) => s.setProjectFilePath)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [segmentModalOpen, setSegmentModalOpen] = useState(false)
  const [durationRange, setDurationRange] = useState<SegmentDurationRange>('7-10')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const reviewStore = useReviewStore()

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }, [])

  async function handleSave() {
    if (!project) return
    const reviewIssues = useReviewStore.getState().issues
    const data = JSON.stringify({ ...project, history: [], future: [], reviewIssues })
    const filePath = await window.api.files.saveProject(data, project.projectFilePath)
    if (filePath) {
      if (!project.projectFilePath) setProjectFilePath(filePath)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(null), 2000)
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (meta && (e.key === 'Z' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault()
      redo()
    }
  }, [undo, redo])

  async function handleReview() {
    if (!project) return
    const currentStatus = useReviewStore.getState().status
    if (currentStatus === 'done' || currentStatus === 'analyzing') { reviewStore.setOpen(true); return }
    const sid = reviewStore.startSession()
    reviewStore.setOpen(true)
    reviewStore.setStatus('analyzing')
    try {
      const issues = await runScrutinize(
        project.cues.map((c) => ({ id: c.id, arabic: c.arabic ?? '', english: c.english })),
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

  async function handleGenerateSegments() {
    if (!project) return
    setSegmentModalOpen(false)
    const transcript = project.cues
      .map((c) => {
        const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
        return `[${fmt(c.startSeconds)}-${fmt(c.endSeconds)}] "${c.english}"`
      })
      .join('\n')
    useSegmentsStore.getState().reset()
    useSegmentsStore.getState().setDetecting(true)
    useSegmentsStore.getState().setReturnScreen('editor')
    setScreen('youtube')
    const result = await window.api.gemini.detectSegments(transcript, durationRange)
    if (result.error) {
      useSegmentsStore.getState().setError(result.error)
    } else {
      const segments = buildSegmentsFromSuggestions(project.cues, result.segments ?? [])
      useSegmentsStore.getState().setSegments(segments)
    }
    useSegmentsStore.getState().setDetecting(false)
  }

  if (!project) return null

  const canUndo = project.history.length > 0
  const canRedo = project.future.length > 0
  const videoName = project.videoPath.split('/').pop() ?? 'Untitled'

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(220,15%,22%)] bg-[hsl(222,20%,12%)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (confirm('Close project? Unsaved changes will be lost.')) {
                reviewStore.reset()
                clearProject()
              }
            }}
            className="text-[hsl(215,15%,50%)] hover:text-white text-sm"
          >
            ← Back
          </button>
          <span className="text-sm font-medium truncate max-w-xs">{videoName}</span>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-xs text-green-400">{saveMsg}</span>}
          <button
            onClick={handleSave}
            className="px-2 py-1 text-xs rounded border border-[hsl(220,15%,25%)] hover:bg-[hsl(222,20%,20%)] transition-colors"
          >
            Save
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="px-2 py-1 text-xs rounded border border-[hsl(220,15%,25%)] disabled:opacity-30 hover:bg-[hsl(222,20%,20%)] transition-colors"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className="px-2 py-1 text-xs rounded border border-[hsl(220,15%,25%)] disabled:opacity-30 hover:bg-[hsl(222,20%,20%)] transition-colors"
          >
            Redo
          </button>
          <button
            onClick={handleReview}
            className="relative px-3 py-1.5 text-sm rounded border border-[hsl(220,15%,30%)] text-[hsl(210,20%,80%)] hover:text-white hover:border-[hsl(220,15%,45%)] transition-colors"
            title="AI review of transcript for errors"
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
          {project.durationSeconds >= 1500 && (
            <button
              onClick={() => setSegmentModalOpen(true)}
              className="px-3 py-1.5 text-sm rounded border border-[hsl(220,15%,30%)] text-[hsl(210,20%,80%)] hover:text-white hover:border-[hsl(220,15%,45%)] transition-colors"
            >
              YouTube Videos
            </button>
          )}
          <div className="flex items-center gap-2">
            {reviewStore.status !== 'done' && reviewStore.issues.length === 0 && (
              <span className="text-[11px] text-amber-400/80" title="Run a review before exporting to catch transcription or translation issues">
                ⚠ Not reviewed
              </span>
            )}
            <button
              onClick={() => setExportOpen(true)}
              className="px-4 py-1.5 text-sm rounded bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium transition-colors"
            >
              Export
            </button>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-[hsl(222,20%,20%)] text-[hsl(215,15%,55%)] hover:text-white transition-colors"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Main two-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: video + style bar */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[hsl(220,15%,22%)]">
          <VideoPreview
            videoPath={project.videoPath}
            cues={project.cues}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onCueSelect={setSelectedCueId}
            videoRef={videoRef}
            selectedCueId={selectedCueId}
          />
          <SubtitleStyleBar />
        </div>

        {/* Right: cue list */}
        <div className="w-96 flex flex-col overflow-hidden">
          <CueList
            cues={project.cues}
            currentTime={currentTime}
            selectedCueId={selectedCueId}
            onSelectCue={(id) => {
              setSelectedCueId(id)
              const cue = project.cues.find((c) => c.id === id)
              if (cue) handleSeek(cue.startSeconds)
            }}
            videoRef={videoRef}
          />
        </div>
      </div>

      {/* Bottom: waveform */}
      <div className="flex-shrink-0 h-32 border-t border-[hsl(220,15%,22%)]">
        <SubtitleTimeline
          audioPath={project.audioPath}
          cues={project.cues}
          currentTime={currentTime}
          duration={project.durationSeconds}
          selectedCueId={selectedCueId}
          onSeek={handleSeek}
          onSelectCue={setSelectedCueId}
        />
      </div>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {reviewStore.open && (
        <ReviewPanel
          videoPath={project.videoPath}
          getAbsoluteTime={(cueId) => project.cues.find((c) => c.id === cueId)?.startSeconds}
          onClose={() => reviewStore.setOpen(false)}
          onRerun={() => { reviewStore.reset(); handleReview() }}
          getCue={(id) => project.cues.find((c) => c.id === id)}
          onApplyFix={(cueId, patch) => updateCue(cueId, patch)}
        />
      )}

      {segmentModalOpen && (
        <SegmentDurationModal
          videoDurationSeconds={project.durationSeconds}
          durationRange={durationRange}
          onChange={setDurationRange}
          onGenerate={handleGenerateSegments}
          onClose={() => setSegmentModalOpen(false)}
        />
      )}
    </div>
  )
}

function SegmentDurationModal({ videoDurationSeconds, durationRange, onChange, onGenerate, onClose }: {
  videoDurationSeconds: number
  durationRange: SegmentDurationRange
  onChange: (r: SegmentDurationRange) => void
  onGenerate: () => void
  onClose: () => void
}) {
  const videoMinutes = videoDurationSeconds / 60
  const ranges: { value: SegmentDurationRange; label: string; minVideoMinutes: number }[] = [
    { value: '4-6',   label: '4–6 minutes',   minVideoMinutes: 12 },
    { value: '7-10',  label: '7–10 minutes',  minVideoMinutes: 14 },
    { value: '11-15', label: '11–15 minutes', minVideoMinutes: 22 },
    { value: '15-20', label: '15–20 minutes', minVideoMinutes: 30 },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[hsl(222,20%,14%)] border border-[hsl(220,15%,22%)] rounded-xl p-6 w-[380px] shadow-2xl flex flex-col gap-5">
        <div>
          <h3 className="text-base font-semibold">YouTube Video Segments</h3>
          <p className="text-xs text-[hsl(215,15%,50%)] mt-1">
            AI will split this lecture into self-contained YouTube-length videos.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[hsl(215,15%,60%)] uppercase tracking-wide">Preferred segment duration</p>
          {ranges.map((r) => {
            const disabled = videoMinutes < r.minVideoMinutes
            return (
              <label
                key={r.value}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  disabled
                    ? 'opacity-35 cursor-not-allowed border-[hsl(220,15%,20%)]'
                    : durationRange === r.value
                      ? 'border-[hsl(210,60%,50%)] bg-[hsl(210,60%,50%,0.1)]'
                      : 'border-[hsl(220,15%,25%)] hover:border-[hsl(220,15%,38%)]'
                }`}
              >
                <input
                  type="radio"
                  name="durationRange"
                  value={r.value}
                  checked={durationRange === r.value}
                  disabled={disabled}
                  onChange={() => onChange(r.value)}
                  className="accent-[hsl(210,80%,55%)]"
                />
                <span className="text-sm">{r.label}</span>
                {disabled && <span className="ml-auto text-[10px] text-[hsl(215,15%,40%)]">video too short</span>}
              </label>
            )
          })}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-[hsl(222,20%,22%)] hover:bg-[hsl(222,20%,28%)] text-white"
          >
            Cancel
          </button>
          <button
            onClick={onGenerate}
            className="px-4 py-2 text-sm rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}

