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
  const hasTrim = trimStart !== null || trimEnd !== null
  const effectiveStart = trimStart ?? 0
  const effectiveEnd = trimEnd ?? duration

  const startPct = duration > 0 ? (effectiveStart / duration) * 100 : 0
  const endPct = duration > 0 ? (effectiveEnd / duration) * 100 : 100

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-t border-[hsl(220,15%,20%)] bg-[hsl(222,20%,11%)]">
      {/* Timeline scrubber with trim region highlight */}
      <div
        className="relative h-1.5 rounded-full bg-[hsl(220,15%,20%)] cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          onSeek(Math.max(0, Math.min(duration, pct * duration)))
        }}
      >
        {/* Trim region */}
        <div
          className="absolute top-0 h-full rounded-full bg-[hsl(210,80%,40%)]/50"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        {/* Playhead */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow"
          style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
        />
        {/* In marker */}
        {trimStart !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-sm bg-[hsl(210,80%,65%)]"
            style={{ left: `${startPct}%` }}
          />
        )}
        {/* Out marker */}
        {trimEnd !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-sm bg-[hsl(210,80%,65%)]"
            style={{ left: `${endPct}%` }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[hsl(215,15%,45%)] font-medium uppercase tracking-wider text-[10px]">Trim</span>

        <button
          onClick={() => onSetTrim(Math.floor(currentTime), trimEnd)}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-[hsl(220,15%,28%)] text-[hsl(210,20%,65%)] hover:text-white hover:border-[hsl(210,80%,55%)] transition-colors"
          title="Set In point to current time"
        >
          <span className="text-[hsl(210,80%,60%)]">▶|</span>
          <span>{trimStart !== null ? fmt(trimStart) : 'Set In'}</span>
        </button>

        <span className="text-[hsl(215,15%,30%)]">→</span>

        <button
          onClick={() => onSetTrim(trimStart, Math.ceil(currentTime))}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-[hsl(220,15%,28%)] text-[hsl(210,20%,65%)] hover:text-white hover:border-[hsl(210,80%,55%)] transition-colors"
          title="Set Out point to current time"
        >
          <span>{trimEnd !== null ? fmt(trimEnd) : 'Set Out'}</span>
          <span className="text-[hsl(210,80%,60%)]">|▶</span>
        </button>

        {hasTrim && (
          <>
            <span className="text-[hsl(215,15%,30%)] mx-0.5">·</span>
            <span className="text-[hsl(215,15%,45%)]">
              {fmt(effectiveEnd - effectiveStart)} kept
            </span>
            <button
              onClick={() => {
                if (trimStart !== null) onSeek(trimStart)
              }}
              className="ml-auto text-[hsl(215,15%,45%)] hover:text-white transition-colors px-1"
              title="Jump to In point"
            >
              ↩
            </button>
            <button
              onClick={() => onSetTrim(null, null)}
              className="px-2 py-0.5 rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,45%)] hover:text-red-400 hover:border-red-700/50 transition-colors"
            >
              Clear
            </button>
          </>
        )}

        {!hasTrim && (
          <span className="ml-auto text-[10px] text-[hsl(215,15%,35%)]">
            seek to a time then click Set In / Set Out
          </span>
        )}
      </div>
    </div>
  )
}
