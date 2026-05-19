import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { Cue } from '../types'
import { useProjectStore } from '../state/projectStore'
import { toFileUrl } from '../utils'

interface Props {
  audioPath: string
  cues: Cue[]
  currentTime: number
  duration: number
  selectedCueId: string | null
  onSeek: (t: number) => void
  onSelectCue: (id: string) => void
  onCreateMedia?: (start: number, end: number) => void
}

export default function SubtitleTimeline({
  audioPath, cues, currentTime, duration, selectedCueId, onSeek, onSelectCue, onCreateMedia,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const updateCue = useProjectStore((s) => s.updateCue)

  const [addMode, setAddMode] = useState(false)
  const [drag, setDrag] = useState<{ startX: number; currentX: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'hsl(210, 20%, 35%)',
      progressColor: 'hsl(210, 80%, 55%)',
      cursorColor: 'hsl(210, 80%, 70%)',
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      plugins: [regions],
    })
    wsRef.current = ws

    ws.load(toFileUrl(audioPath)).catch(() => {})

    ws.on('interaction', (newTime: number) => {
      onSeek(newTime)
    })

    regions.on('region-clicked', (region) => {
      onSelectCue(region.id)
    })

    regions.on('region-updated', (region) => {
      updateCue(region.id, {
        startSeconds: region.start,
        endSeconds: region.end,
      })
    })

    return () => {
      ws.destroy()
    }
  }, [audioPath])

  // Sync regions when cues change
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions) return
    const existing = regions.getRegions()
    for (const r of existing) r.remove()
    for (const cue of cues) {
      regions.addRegion({
        id: cue.id,
        start: cue.startSeconds,
        end: cue.endSeconds,
        color: selectedCueId === cue.id
          ? 'rgba(59, 130, 246, 0.3)'
          : 'rgba(100, 150, 255, 0.15)',
        drag: true,
        resize: true,
      })
    }
  }, [cues, selectedCueId])

  // Sync playback position
  useEffect(() => {
    if (!wsRef.current) return
    const dur = wsRef.current.getDuration()
    if (dur > 0) {
      wsRef.current.seekTo(currentTime / dur)
    }
  }, [currentTime])

  function xToTime(x: number, rect: DOMRect): number {
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    return ratio * duration
  }

  function handleOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!addMode) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setDrag({ startX: x, currentX: x })
  }

  function handleOverlayMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!drag) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDrag((d) => d ? { ...d, currentX: e.clientX - rect.left } : null)
  }

  function handleOverlayMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!drag || !onCreateMedia) { setDrag(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const start = xToTime(Math.min(drag.startX, endX), rect)
    const end = xToTime(Math.max(drag.startX, endX), rect)
    setDrag(null)
    if (end - start > 0.5) {
      onCreateMedia(start, end)
    }
  }

  const selLeft = drag ? Math.min(drag.startX, drag.currentX) : 0
  const selWidth = drag ? Math.abs(drag.currentX - drag.startX) : 0

  return (
    <div className="h-full flex flex-col bg-[hsl(222,20%,9%)] px-2 py-1">
      <div className="text-[10px] text-[hsl(215,15%,40%)] mb-1 flex items-center gap-2">
        <span>Waveform</span>
        <span className="opacity-50">· drag region edges to adjust timing</span>
        {onCreateMedia && (
          <button
            onClick={() => { setAddMode((v) => !v); setDrag(null) }}
            className={`ml-auto px-2 py-0.5 rounded text-[10px] border transition-colors ${
              addMode
                ? 'bg-teal-600/30 border-teal-500/60 text-teal-300'
                : 'border-[hsl(220,15%,28%)] text-[hsl(215,15%,50%)] hover:text-white hover:border-[hsl(220,15%,40%)]'
            }`}
          >
            {addMode ? '× Cancel' : '+ Add Clip / Segment'}
          </button>
        )}
      </div>
      <div className="flex-1 relative" ref={overlayRef}>
        <div ref={containerRef} className="w-full h-full" />
        {addMode && (
          <div
            className="absolute inset-0"
            style={{ cursor: 'crosshair' }}
            onMouseDown={handleOverlayMouseDown}
            onMouseMove={handleOverlayMouseMove}
            onMouseUp={handleOverlayMouseUp}
            onMouseLeave={() => { if (drag) setDrag(null) }}
          >
            {drag && (
              <div
                className="absolute top-0 bottom-0 bg-teal-400/25 border-x border-teal-400/60 pointer-events-none"
                style={{ left: selLeft, width: selWidth }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
