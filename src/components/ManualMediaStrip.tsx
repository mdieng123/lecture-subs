import { useRef, useEffect, useState } from 'react'
import type { ManualMedia } from '../types'
import { formatDuration, toFileUrl } from '../utils'

interface Props {
  items: ManualMedia[]
  videoPath: string
  onOpen: (item: ManualMedia) => void
  onDelete: (id: string) => void
}

export default function ManualMediaStrip({ items, videoPath, onOpen, onDelete }: Props) {
  if (items.length === 0) return null

  return (
    <div className="border-t border-[hsl(220,15%,18%)] px-3 py-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            videoPath={videoPath}
            onOpen={() => onOpen(item)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

function MediaCard({ item, videoPath, onOpen, onDelete }: {
  item: ManualMedia
  videoPath: string
  onOpen: () => void
  onDelete: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [thumbReady, setThumbReady] = useState(false)
  const isClip = item.kind === 'clip'

  useEffect(() => {
    const video = document.createElement('video')
    video.src = toFileUrl(videoPath)
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
      // Aspect: clip = 9:16 preview, segment = 16:9
      canvas.width = isClip ? 54 : 120
      canvas.height = isClip ? 96 : 68
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      setThumbReady(true)
      video.src = ''
    }, { once: true })

    video.load()
    return () => { video.src = '' }
  }, [videoPath, item.startSeconds, isClip])

  return (
    <div
      className="relative flex-shrink-0 rounded-lg overflow-hidden border border-[hsl(220,15%,25%)] cursor-pointer group hover:border-[hsl(210,80%,55%)] transition-colors"
      style={{ width: isClip ? 54 : 120, height: isClip ? 96 : 68 }}
      onClick={onOpen}
      title={`${item.title} · click to open`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: 'cover', display: thumbReady ? 'block' : 'none' }}
      />
      {!thumbReady && <div className="absolute inset-0 bg-[hsl(222,20%,16%)]" />}

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
          <p className="text-[8px] text-white/60">{formatDuration(item.endSeconds - item.startSeconds)}</p>
        </div>
      </div>

      {/* Play hint on hover */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="white"><polygon points="3,2 8,5 3,8"/></svg>
        </div>
      </div>
    </div>
  )
}
