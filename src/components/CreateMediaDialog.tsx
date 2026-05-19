import { useState, useEffect, useRef } from 'react'
import { formatDuration } from '../utils'

interface Props {
  start: number
  end: number
  onConfirm: (title: string, kind: 'clip' | 'segment') => void
  onClose: () => void
}

export default function CreateMediaDialog({ start, end, onConfirm, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'clip' | 'segment'>('segment')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit() {
    const t = title.trim()
    if (!t) return
    onConfirm(t, kind)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[hsl(222,20%,12%)] border border-[hsl(220,15%,22%)] rounded-2xl shadow-2xl p-6 w-[400px] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-white mb-0.5">New media</p>
          <p className="text-[11px] text-[hsl(215,15%,45%)]">
            {formatDuration(start)} → {formatDuration(end)} &nbsp;·&nbsp; {formatDuration(end - start)} long
          </p>
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
          placeholder="Title…"
          className="bg-[hsl(222,20%,9%)] border border-[hsl(220,15%,28%)] rounded-lg px-3 py-2 text-sm text-white placeholder-[hsl(215,15%,38%)] focus:outline-none focus:border-[hsl(210,80%,55%)]"
        />

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
              {k === 'segment' ? 'YouTube Segment (16:9)' : 'Clip / Reel (9:16)'}
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
            disabled={!title.trim()}
            className="px-4 py-1.5 text-xs rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,62%)] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
