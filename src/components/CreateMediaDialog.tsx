import { useState, useEffect, useRef } from 'react'
import { formatDuration } from '../utils'

interface Props {
  start: number
  end: number
  duration: number
  onConfirm: (title: string, kind: 'clip' | 'segment', start: number, end: number) => void
  onClose: () => void
}

function parseMmss(s: string): number | null {
  const parts = s.split(':')
  if (parts.length === 2) {
    const m = parseInt(parts[0]); const sec = parseFloat(parts[1])
    if (!isNaN(m) && !isNaN(sec)) return m * 60 + sec
  }
  if (parts.length === 3) {
    const h = parseInt(parts[0]); const m = parseInt(parts[1]); const sec = parseFloat(parts[2])
    if (!isNaN(h) && !isNaN(m) && !isNaN(sec)) return h * 3600 + m * 60 + sec
  }
  const f = parseFloat(s)
  return isNaN(f) ? null : f
}

function toMmss(s: number): string {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(2).padStart(5, '0')
  return `${m}:${sec}`
}

export default function CreateMediaDialog({ start, end, duration, onConfirm, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'clip' | 'segment'>('segment')
  const [startRaw, setStartRaw] = useState(toMmss(start))
  const [endRaw, setEndRaw] = useState(toMmss(end))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const startVal = parseMmss(startRaw) ?? start
  const endVal = parseMmss(endRaw) ?? end
  const dur = Math.max(0, endVal - startVal)

  function handleSubmit() {
    const t = title.trim()
    if (!t || dur < 0.5) return
    onConfirm(t, kind, startVal, endVal)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[hsl(222,20%,12%)] border border-[hsl(220,15%,22%)] rounded-2xl shadow-2xl p-6 w-[420px] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white">New media</p>

        {/* Title */}
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
          placeholder="Title…"
          className="bg-[hsl(222,20%,9%)] border border-[hsl(220,15%,28%)] rounded-lg px-3 py-2 text-sm text-white placeholder-[hsl(215,15%,38%)] focus:outline-none focus:border-[hsl(210,80%,55%)]"
        />

        {/* Time range */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[hsl(215,15%,45%)]">Start</span>
            <input
              value={startRaw}
              onChange={(e) => setStartRaw(e.target.value)}
              className="bg-[hsl(222,20%,9%)] border border-[hsl(220,15%,28%)] rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[hsl(210,80%,55%)] w-full"
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-[hsl(215,15%,45%)]">{formatDuration(dur)}</span>
            <span className="text-[hsl(215,15%,40%)] pb-2">→</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[hsl(215,15%,45%)]">End</span>
            <input
              value={endRaw}
              onChange={(e) => setEndRaw(e.target.value)}
              className="bg-[hsl(222,20%,9%)] border border-[hsl(220,15%,28%)] rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[hsl(210,80%,55%)] w-full"
            />
          </div>
        </div>

        {/* Type */}
        <div className="flex gap-2">
          {(['segment', 'clip'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                kind === k
                  ? k === 'segment'
                    ? 'bg-blue-600/30 border-blue-500/60 text-blue-300'
                    : 'bg-purple-600/30 border-purple-500/60 text-purple-300'
                  : 'border-[hsl(220,15%,25%)] text-[hsl(215,15%,50%)] hover:text-white'
              }`}
            >
              {k === 'segment' ? '⬛ YouTube (16:9)' : '▬ Reel / Clip (9:16)'}
            </button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg border border-[hsl(220,15%,25%)] text-[hsl(215,15%,50%)] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || dur < 0.5}
            className="px-4 py-1.5 text-xs rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,62%)] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
