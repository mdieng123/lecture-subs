import { useRef, useCallback } from 'react'

interface Props {
  currentTime: number
  duration: number
  trimStart: number | null
  trimEnd: number | null
  onSetTrim: (start: number | null, end: number | null) => void
  onSeek: (t: number) => void
}

function fmt(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function TrimBar({ currentTime, duration, trimStart, trimEnd, onSetTrim, onSeek }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'start' | 'end' | 'seek' | null>(null)

  const inSec = trimStart ?? 0
  const outSec = trimEnd ?? duration
  const inPct = duration > 0 ? (inSec / duration) * 100 : 0
  const outPct = duration > 0 ? (outSec / duration) * 100 : 100
  const playPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const hasTrim = trimStart !== null || trimEnd !== null

  const pctToTime = useCallback((clientX: number) => {
    if (!trackRef.current) return 0
    const { left, width } = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(duration, ((clientX - left) / width) * duration))
  }, [duration])

  const onMouseDown = (handle: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = handle

    const onMove = (ev: MouseEvent) => {
      const t = pctToTime(ev.clientX)
      if (dragging.current === 'start') {
        onSetTrim(Math.min(t, outSec - 1), trimEnd)
      } else {
        onSetTrim(trimStart, Math.max(t, inSec + 1))
      }
    }
    const onUp = () => {
      dragging.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onTrackClick = (e: React.MouseEvent) => {
    if (dragging.current) return
    onSeek(pctToTime(e.clientX))
  }

  return (
    <div className="px-3 py-2.5 border-t border-[hsl(220,15%,20%)] bg-[hsl(222,20%,11%)] select-none">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-[hsl(215,15%,40%)] font-medium uppercase tracking-wider">Trim</span>
        {hasTrim && (
          <>
            <span className="text-[11px] text-[hsl(210,20%,60%)]">{fmt(inSec)} → {fmt(outSec)}</span>
            <span className="text-[hsl(215,15%,30%)]">·</span>
            <span className="text-[11px] text-[hsl(215,15%,45%)]">{fmt(outSec - inSec)} kept</span>
            <button
              onClick={() => onSetTrim(null, null)}
              className="ml-auto text-[11px] px-2 py-0.5 rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,45%)] hover:text-red-400 hover:border-red-700/50 transition-colors"
            >
              Clear
            </button>
          </>
        )}
        {!hasTrim && (
          <span className="text-[10px] text-[hsl(215,15%,32%)]">drag the handles to set in / out points</span>
        )}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-pointer"
        onClick={onTrackClick}
      >
        {/* Background rail */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[hsl(220,15%,22%)]" />

        {/* Dimmed region before in point */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-[hsl(220,15%,15%)] rounded-l-full"
          style={{ left: 0, width: `${inPct}%` }}
        />

        {/* Active region */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-[hsl(210,70%,45%)]"
          style={{ left: `${inPct}%`, width: `${outPct - inPct}%` }}
        />

        {/* Dimmed region after out point */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-[hsl(220,15%,15%)] rounded-r-full"
          style={{ left: `${outPct}%`, right: 0 }}
        />

        {/* In handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 cursor-ew-resize group"
          style={{ left: `${inPct}%` }}
          onMouseDown={onMouseDown('start')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-3 h-5 rounded-sm bg-white shadow-md flex items-center justify-center hover:bg-[hsl(210,80%,80%)] transition-colors">
            <div className="flex gap-px">
              <div className="w-px h-2.5 bg-[hsl(215,20%,40%)] rounded" />
              <div className="w-px h-2.5 bg-[hsl(215,20%,40%)] rounded" />
            </div>
          </div>
          {/* Label */}
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[9px] text-[hsl(210,20%,60%)] whitespace-nowrap pointer-events-none">
            {fmt(inSec)}
          </div>
        </div>

        {/* Out handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 cursor-ew-resize group"
          style={{ left: `${outPct}%` }}
          onMouseDown={onMouseDown('end')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-3 h-5 rounded-sm bg-white shadow-md flex items-center justify-center hover:bg-[hsl(210,80%,80%)] transition-colors">
            <div className="flex gap-px">
              <div className="w-px h-2.5 bg-[hsl(215,20%,40%)] rounded" />
              <div className="w-px h-2.5 bg-[hsl(215,20%,40%)] rounded" />
            </div>
          </div>
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[9px] text-[hsl(210,20%,60%)] whitespace-nowrap pointer-events-none">
            {fmt(outSec)}
          </div>
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 z-10 pointer-events-none"
          style={{ left: `${playPct}%` }}
        >
          <div className="w-px h-full bg-white/60" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/80" />
        </div>
      </div>
    </div>
  )
}
