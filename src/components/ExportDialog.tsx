import { useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useClipsStore, buildClipsFromSuggestions } from '../state/clipsStore'
import { serializeSrt } from '../utils'
import type { ExportOptions } from '../types'

export default function ExportDialog({ onClose, onCreateSegments }: { onClose: () => void; onCreateSegments?: () => void }) {
  const project = useProjectStore((s) => s.project)
  const setScreen = useProjectStore((s) => s.setScreen)
  const subtitleStyle = useProjectStore((s) => s.subtitleStyle)
  const setSubtitleStyle = useProjectStore((s) => s.setSubtitleStyle)
  const logoSettings = useProjectStore((s) => s.logoSettings)
  const introVideoPath = useProjectStore((s) => s.introVideoPath)
  const audioBackgroundPath = useProjectStore((s) => s.audioBackgroundPath)
  const { setClips, setDetecting, setError: setClipsError, reset } = useClipsStore()
  const [options, setOptions] = useState<ExportOptions>({
    mode: 'soft',
    fontSize: subtitleStyle.fontSize,
    position: subtitleStyle.position,
    background: subtitleStyle.background,
    includeArabic: subtitleStyle.includeArabic,
  })
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!project) return null

  function opt<K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) {
    setOptions((prev) => ({ ...prev, [k]: v }))
    // Keep shared style fields in sync with the store
    if (k === 'fontSize' || k === 'position' || k === 'background' || k === 'includeArabic') {
      setSubtitleStyle({ [k]: v } as Parameters<typeof setSubtitleStyle>[0])
    }
  }

  async function handleCreateClips() {
    if (!project) return
    reset()
    setDetecting(true)
    onClose()
    setScreen('clips')

    const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
    const fmt = (s: number) => `${pad(s / 60)}:${pad(s % 60)}`
    const transcript = project.cues
      .map((c) => `[${fmt(c.startSeconds)}-${fmt(c.endSeconds)}] "${c.english}"`)
      .join('\n')

    const result = await window.api.gemini.detectClips(transcript)
    if ('error' in result && result.error) {
      setDetecting(false)
      setClipsError(result.error as string)
      return
    }
    const clips = buildClipsFromSuggestions(project.cues, (result as any).clips ?? [])
    setClips(clips)
    setDetecting(false)
  }

  async function handleDownloadTranscript() {
    if (!project) return
    const text = project.cues.map((c) => c.english.trim()).filter(Boolean).join('\n')
    const baseName = project.videoPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'transcript'
    const savePath = await window.api.files.saveFile({
      defaultPath: `${baseName}_transcript.txt`,
      filters: [{ name: 'Text File', extensions: ['txt'] }],
    })
    if (!savePath) return
    await window.api.files.writeFile(savePath, text)
    setDone(true)
  }

  async function handleExport() {
    if (!project) return
    setExporting(true)
    setError(null)

    try {
      const dur = project.durationSeconds
      const clampedCues = project.cues.map((c) => ({
        ...c,
        startSeconds: Math.min(c.startSeconds, dur),
        endSeconds: Math.min(c.endSeconds, dur),
      })).filter((c) => c.startSeconds < c.endSeconds)
      const srtContent = serializeSrt(clampedCues, options.includeArabic)
      const baseName = project.videoPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'output'

      if (options.mode === 'srt') {
        const savePath = await window.api.files.saveFile({
          defaultPath: `${baseName}.srt`,
          filters: [{ name: 'SRT Subtitles', extensions: ['srt'] }],
        })
        if (!savePath) { setExporting(false); return }
        await window.api.files.writeFile(savePath, srtContent)
        setDone(true)
        return
      }

      const tmpDir = await window.api.files.getTmpDir()
      const srtPath = `${tmpDir}/export.srt`
      await window.api.files.writeFile(srtPath, srtContent)

      // For audio-only projects, create a slideshow video first
      let videoSource = project.videoPath
      if (project.audioOnly) {
        const slideshowPath = `${tmpDir}/slideshow.mp4`
        await window.api.ffmpeg.createVideoFromAudio(project.videoPath, audioBackgroundPath, slideshowPath)
        videoSource = slideshowPath
      }

      // Determine if we need to prepend an intro
      const hasIntro = !!(introVideoPath && await window.api.files.exists(introVideoPath))

      const savePath = await window.api.files.saveFile({
        defaultPath: `${baseName}_${options.mode === 'soft' ? 'subtitled' : 'hardsub'}.mp4`,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
      })
      if (!savePath) { setExporting(false); return }

      const mainExportPath = hasIntro ? `${tmpDir}/main_export.mp4` : savePath

      if (options.mode === 'soft') {
        await window.api.ffmpeg.exportSoftSubs(videoSource, srtPath, mainExportPath)
      } else {
        const fontSizeMap = { small: 18, medium: 22, large: 28, xl: 38, xxl: 52 }
        await window.api.ffmpeg.exportHardSubs(videoSource, srtPath, mainExportPath, {
          fontSize: fontSizeMap[options.fontSize ?? 'medium'],
          position: options.position,
          background: options.background,
          includeArabic: options.includeArabic,
          ...(logoSettings.enabled && logoSettings.path ? {
            logoPath: logoSettings.path,
            logoPosition: logoSettings.position,
            logoSize: logoSettings.size,
          } : {}),
        })
      }

      if (hasIntro) {
        await window.api.ffmpeg.prependIntro(introVideoPath!, mainExportPath, savePath)
      }

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[hsl(222,20%,14%)] border border-[hsl(220,15%,22%)] rounded-xl p-6 w-[440px] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">Export</h2>
          <button onClick={onClose} className="text-[hsl(215,15%,50%)] hover:text-white text-xl">×</button>
        </div>

        {done ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-2xl">✅</div>
            <div className="text-[hsl(210,20%,80%)]">Export complete!</div>
            <button onClick={onClose} className="px-4 py-2 rounded bg-[hsl(210,80%,55%)] text-white text-sm">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-5">
              {([
                ['srt', 'Subtitle file only (.srt)', ''],
                ['soft', 'Video with soft subtitles (fast, recommended)', ''],
                ['hard', 'Video with burned-in subtitles (slower, works everywhere)', ''],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={options.mode === value}
                    onChange={() => opt('mode', value)}
                    className="mt-0.5 accent-[hsl(210,80%,55%)]"
                  />
                  <span className="text-sm text-[hsl(210,20%,80%)]">{label}</span>
                </label>
              ))}
            </div>

            {options.mode === 'hard' && (
              <div className="space-y-3 mb-5 pl-6 border-l-2 border-[hsl(220,15%,25%)]">
                <Select label="Font size" value={options.fontSize ?? 'medium'} onChange={(v) => opt('fontSize', v as ExportOptions['fontSize'])}
                  options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['xl', 'XL'], ['xxl', 'XXL']]} />
                <Select label="Position" value={options.position ?? 'bottom'} onChange={(v) => opt('position', v as ExportOptions['position'])}
                  options={[['bottom', 'Bottom'], ['center', 'Center'], ['top', 'Top']]} />
                <Select label="Background" value={options.background ?? 'none'} onChange={(v) => opt('background', v as ExportOptions['background'])}
                  options={[['none', 'None'], ['semi', 'Semi-transparent'], ['solid', 'Solid']]} />
              </div>
            )}

            <label className="flex items-center gap-2 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={options.includeArabic ?? false}
                onChange={(e) => opt('includeArabic', e.target.checked)}
                className="accent-[hsl(210,80%,55%)]"
              />
              <span className="text-sm text-[hsl(210,20%,80%)]">Include Arabic text</span>
            </label>

            {error && (
              <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-red-400 text-xs">
                {error}
              </div>
            )}

            <div className="space-y-2 mb-3">
              <button
                onClick={handleCreateClips}
                className="w-full px-4 py-2 rounded border border-[hsl(280,60%,50%)] text-[hsl(280,70%,75%)] hover:bg-[hsl(280,30%,20%)] text-sm transition-colors text-left flex items-center gap-2"
              >
                <span>✦</span>
                <span>Create Intelligent Clips (Instagram / TikTok / Shorts)</span>
              </button>
              {onCreateSegments && (
                <button
                  onClick={() => { onClose(); onCreateSegments() }}
                  className="w-full px-4 py-2 rounded border border-[hsl(200,60%,45%)] text-[hsl(200,70%,70%)] hover:bg-[hsl(200,30%,18%)] text-sm transition-colors text-left flex items-center gap-2"
                >
                  <span>✦</span>
                  <span>Create YouTube Segments (split long lecture)</span>
                </button>
              )}
              <button
                onClick={handleDownloadTranscript}
                className="w-full px-4 py-2 rounded border border-[hsl(220,15%,30%)] text-[hsl(210,20%,70%)] hover:bg-[hsl(220,15%,20%)] text-sm transition-colors text-left flex items-center gap-2"
              >
                <span>↓</span>
                <span>Download Transcript (.txt)</span>
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-[hsl(215,15%,55%)] hover:text-white">
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="px-5 py-2 rounded bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[hsl(215,15%,55%)] w-20">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-[hsl(222,20%,18%)] border border-[hsl(220,15%,25%)] rounded px-2 py-1 text-[hsl(210,20%,80%)]"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
