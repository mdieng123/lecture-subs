import { useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { serializeSrt } from '../utils'
import type { ManualMedia } from '../types'

interface Props {
  items: ManualMedia[]
  onClose: () => void
}

const FONT_SIZE_PX: Record<string, number> = { small: 18, medium: 22, large: 28, xl: 38, xxl: 52 }

export default function ManualMediaExportDialog({ items, onClose }: Props) {
  const project = useProjectStore((s) => s.project)
  const subtitleStyle = useProjectStore((s) => s.subtitleStyle)
  const logoSettings = useProjectStore((s) => s.logoSettings)
  const toggleSelected = useProjectStore((s) => s.toggleManualMediaSelected)

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const selected = items.filter((i) => i.selected)

  if (!project) return null

  async function handleExport() {
    if (!project || selected.length === 0) return
    setExporting(true)
    setError(null)

    try {
      for (let i = 0; i < selected.length; i++) {
        const item = selected[i]
        setProgress(`Exporting ${i + 1} / ${selected.length}: ${item.title}…`)

        const srtContent = serializeSrt(item.cues, subtitleStyle.includeArabic)
        const tmpDir = await window.api.files.getTmpDir()
        const srtPath = `${tmpDir}/manual_${item.id}.srt`
        await window.api.files.writeFile(srtPath, srtContent)

        const ext = item.kind === 'clip' ? 'mp4' : 'mp4'
        const safeName = item.title.replace(/[^a-z0-9_\-\s]/gi, '_').trim()
        const result = await window.api.files.saveFile({
          defaultPath: `${safeName}.${ext}`,
          filters: [{ name: 'Video', extensions: ['mp4'] }],
        })
        if (!result) continue

        const opts = {
          fontSize: FONT_SIZE_PX[subtitleStyle.fontSize] ?? 22,
          position: subtitleStyle.position,
          background: subtitleStyle.background,
          includeArabic: subtitleStyle.includeArabic,
          logoPath: logoSettings.enabled ? logoSettings.path : null,
          logoPosition: logoSettings.position,
          logoSize: logoSettings.size,
          logoOpacity: logoSettings.opacity,
        }

        let exportResult: { error?: string }
        if (item.kind === 'clip') {
          exportResult = await window.api.ffmpeg.exportClip(
            project.videoPath, srtPath,
            item.startSeconds, item.endSeconds - item.startSeconds,
            result, opts
          )
        } else {
          exportResult = await window.api.ffmpeg.exportSegment(
            project.videoPath, srtPath,
            item.startSeconds, item.endSeconds - item.startSeconds,
            result, opts
          )
        }

        if (exportResult.error) throw new Error(exportResult.error)
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={!exporting ? onClose : undefined}>
      <div
        className="bg-[hsl(222,20%,12%)] border border-[hsl(220,15%,22%)] rounded-2xl shadow-2xl p-6 w-[440px] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white">Export media</p>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-xl">✓</div>
            <p className="text-sm text-[hsl(215,15%,70%)]">Export complete</p>
            <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg bg-[hsl(210,80%,55%)] text-white font-medium">Done</button>
          </div>
        ) : (
          <>
            {/* Item list */}
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {items.map((item) => (
                <label key={item.id} className="flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2 hover:bg-[hsl(222,20%,16%)] transition-colors">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleSelected(item.id)}
                    className="accent-[hsl(210,80%,55%)]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{item.title}</p>
                    <p className="text-[10px] text-[hsl(215,15%,45%)]">
                      {item.kind === 'clip' ? 'Clip 9:16' : 'Segment 16:9'} · {Math.round(item.endSeconds - item.startSeconds)}s
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {exporting && progress && (
              <p className="text-xs text-[hsl(215,15%,50%)]">{progress}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                disabled={exporting}
                className="px-4 py-1.5 text-xs rounded-lg border border-[hsl(220,15%,25%)] text-[hsl(215,15%,50%)] hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || selected.length === 0}
                className="px-4 py-1.5 text-xs rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,62%)] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {exporting && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
                Export {selected.length > 0 ? `${selected.length} item${selected.length > 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
