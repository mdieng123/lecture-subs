import { useState, useRef, useCallback } from 'react'
import { useProjectStore } from '../state/projectStore'
import SubtitleStyleBar from './SubtitleStyleBar'
import type { Project } from '../types'
import VideoPreview from './VideoPreview'
import CueList from './CueList'
import SubtitleTimeline from './SubtitleTimeline'
import ExportDialog from './ExportDialog'
import SettingsDialog from './SettingsDialog'

export default function EditorScreen() {
  const project = useProjectStore((s) => s.project)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const clearProject = useProjectStore((s) => s.clearProject)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }, [])

  async function handleSave() {
    if (!project) return
    const data = JSON.stringify({ ...project, history: [], future: [] })
    const filePath = await window.api.files.saveProject(data, project.projectFilePath)
    if (filePath) {
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
            onClick={() => setExportOpen(true)}
            className="px-4 py-1.5 text-sm rounded bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium transition-colors"
          >
            Export
          </button>
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
    </div>
  )
}

