import { useState, useCallback, useEffect, useRef } from 'react'
import { useProjectStore } from '../state/projectStore'
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
  const settings = useProjectStore((s) => s.settings)
  const setScreen = useProjectStore((s) => s.setScreen)
  const setProcessing = useProjectStore((s) => s.setProcessing)
  const setProject = useProjectStore((s) => s.setProject)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [dragging, setDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<'file' | 'youtube'>('file')
  const [ytUrl, setYtUrl] = useState('')
  const [ytDownloading, setYtDownloading] = useState(false)
  const [ytProgress, setYtProgress] = useState(0)
  const [ytStatus, setYtStatus] = useState('')
  const cancelRef = useRef(false)

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
      await loadVideo(filePath, title)
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

  async function loadVideo(filePath: string, title?: string) {
    setLoadError(null)
    try {
      const { duration, hasAudio } = await window.api.ffmpeg.getVideoDuration(filePath)
      if (!hasAudio) {
        setLoadError('This video has no audio track. Please use a video with audio.')
        return
      }
      const name = title ?? filePath.split('/').pop() ?? filePath
      setVideoInfo({ path: filePath, name, size: 'unknown', duration })
      setTab('file')
    } catch (err) {
      setLoadError(`Could not read video: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function loadProject(rawJson: string, projectFilePath: string) {
    try {
      const project = JSON.parse(rawJson)
      const videoExists = await window.api.files.exists(project.videoPath)
      if (!videoExists) {
        setLoadError(`Video not found: "${project.videoPath.split('/').pop()}". Please locate it below.`)
        // Store the project data without the bad path, prompt user to pick the video
        const newVideoPath = await window.api.files.openAny()
        if (!newVideoPath || newVideoPath.endsWith('.lecturesubs')) {
          setLoadError('Could not locate video — project not loaded.')
          return
        }
        setProject({ ...project, videoPath: newVideoPath, projectFilePath })
        setLoadError(null)
        return
      }
      setProject({ ...project, projectFilePath })
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
    const allowed = ['mp4', 'mov', 'mkv', 'webm', 'avi']
    if (!allowed.includes(ext)) {
      setLoadError(`Unsupported file type: .${ext}`)
      return
    }
    await loadVideo(window.api.getFilePath(file))
  }, [setProject, loadVideo])

  async function handleBrowse() {
    const filePath = await window.api.files.openAny()
    if (!filePath) return
    if (filePath.endsWith('.lecturesubs')) {
      const raw = await window.api.files.readFile(filePath)
      await loadProject(raw, filePath)
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
                  <div className="text-4xl opacity-40">📹</div>
                  <div className="text-[hsl(210,20%,80%)] font-medium">Drop video here or click to browse</div>
                  <div className="text-sm text-[hsl(215,15%,50%)]">MP4, MOV, MKV, WebM, AVI · .lecturesubs</div>
                </div>
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
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs text-[hsl(215,15%,50%)]">
                      <span className="truncate max-w-[80%]">{ytStatus || 'Downloading...'}</span>
                      <span>{ytProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[hsl(222,20%,22%)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[hsl(210,80%,55%)] transition-all duration-300"
                        style={{ width: `${ytProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
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
            disabled={!videoInfo || !hasApiKey || !hasGroqKey}
            className="px-8 py-3 rounded-lg font-semibold text-base transition-all
              bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[hsl(210,80%,55%)]"
          >
            Transcribe &amp; Translate
          </button>
          {(!hasApiKey || !hasGroqKey) && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[hsl(222,20%,20%)] border border-[hsl(220,15%,30%)] text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {!hasApiKey ? 'Add your Gemini API key in Settings' : 'Add your Groq API key in Settings'}
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
