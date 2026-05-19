import { useRef, useEffect, useState } from 'react'
import type { ManualMedia } from '../types'
import { formatDuration, toFileUrl } from '../utils'

interface Props {
  items: ManualMedia[]
  videoPath: string
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => void
}

export default function ManualMediaStrip({ items, videoPath, onToggleSelect, onDelete }: Props) {
  if (items.length === 0) return null

  return (
    <div className="border-t border-[hsl(220,15%,18%)] bg-[hsl(222,20%,8%)] px-2 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-[hsl(215,15%,40%)]">Manual media</span>
        <span className="text-[10px] text-[hsl(215,15%,30%)]">· {items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            videoPath={videoPath}
            onToggleSelect={() => onToggleSelect(item.id)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

function MediaCard({ item, videoPath, onToggleSelect, onDelete }: {
  item: ManualMedia
  videoPath: string
  onToggleSelect: () => void
  onDelete: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [thumbReady, setThumbReady] = useState(false)

  useEffect(() => {
    const video = document.createElement('video')
    video.src = toFileUrl(videoPath)
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = item.startSeconds + 1
    })

    video.addEventListener('seeked', () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = 120
      canvas.height = item.kind === 'clip' ? 213 : 68
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      setThumbReady(true)
      video.src = ''
    }, { once: true })

    video.load()
    return () => { video.src = '' }
  }, [videoPath, item.startSeconds, item.kind])

  const isClip = item.kind === 'clip'

  return (
    <div
      className={`relative flex-shrink-0 rounded-lg overflow-hidden border cursor-pointer transition-colors group ${
        item.selected
          ? 'border-[hsl(210,80%,55%)]'
          : 'border-[hsl(220,15%,22%)] hover:border-[hsl(220,15%,35%)]'
      }`}
      style={{ width: isClip ? 56 : 120, height: 68 }}
      onClick={onToggleSelect}
    >
      {/* Thumbnail canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: thumbReady ? 'block' : 'none' }}
      />
      {/* Fallback bg */}
      {!thumbReady && (
        <div className="absolute inset-0 bg-[hsl(222,20%,14%)]" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 flex flex-col justify-between p-1">
        <div className="flex items-start justify-between">
          <span className={`text-[8px] px-1 py-0.5 rounded font-medium leading-none ${
            isClip ? 'bg-purple-600/80 text-purple-100' : 'bg-blue-600/80 text-blue-100'
          }`}>
            {isClip ? 'CLIP' : 'SEG'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full bg-black/70 text-white text-[9px] flex items-center justify-center transition-opacity hover:bg-red-600/80"
          >
            ×
          </button>
        </div>
        <div>
          <p className="text-[9px] text-white font-medium truncate leading-tight">{item.title}</p>
          <p className="text-[8px] text-white/60 leading-tight">{formatDuration(item.endSeconds - item.startSeconds)}</p>
        </div>
      </div>

      {/* Selection checkbox */}
      {item.selected && (
        <div className="absolute top-1 left-1 w-3 h-3 rounded-sm bg-[hsl(210,80%,55%)] flex items-center justify-center">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="white"><path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.2" fill="none"/></svg>
        </div>
      )}
    </div>
  )
}
