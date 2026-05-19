import { useState, useRef, KeyboardEvent, RefObject } from 'react'
import type { Cue } from '../types'
import { useProjectStore } from '../state/projectStore'
import { formatDuration } from '../utils'

interface Props {
  cue: Cue
  isSelected: boolean
  isActive: boolean
  index: number
  onSelect: () => void
  videoRef: RefObject<HTMLVideoElement | null>
  cues: Cue[]
}

export default function CueRow({ cue, isSelected, isActive, index, onSelect, videoRef, cues }: Props) {
  const updateCue = useProjectStore((s) => s.updateCue)
  const mergeWithNext = useProjectStore((s) => s.mergeWithNext)
  const deleteCue = useProjectStore((s) => s.deleteCue)
  const [editingArabic, setEditingArabic] = useState(false)
  const englishRef = useRef<HTMLTextAreaElement | null>(null)

  function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName
    if (e.key === ' ' && tag !== 'TEXTAREA' && tag !== 'INPUT') {
      e.preventDefault()
      if (videoRef.current) {
        if (videoRef.current.paused) videoRef.current.play()
        else videoRef.current.pause()
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      // Play just this cue
      if (videoRef.current) {
        videoRef.current.currentTime = cue.startSeconds
        videoRef.current.play()
      }
    }
    const meta = e.ctrlKey || e.metaKey
    if (meta && e.key === 'm') {
      e.preventDefault()
      mergeWithNext(cue.id)
    }
    if (e.key === '[') {
      updateCue(cue.id, { startSeconds: Math.max(0, cue.startSeconds - 0.1) })
    }
    if (e.key === ']') {
      updateCue(cue.id, { startSeconds: cue.startSeconds + 0.1 })
    }
    if (e.key === '{') {
      updateCue(cue.id, { endSeconds: Math.max(cue.startSeconds + 0.1, cue.endSeconds - 0.1) })
    }
    if (e.key === '}') {
      updateCue(cue.id, { endSeconds: cue.endSeconds + 0.1 })
    }
  }

  const borderColor = isActive
    ? 'border-[hsl(210,80%,55%)]'
    : isSelected
    ? 'border-[hsl(220,15%,35%)]'
    : 'border-transparent'

  return (
    <div
      className={`mx-2 my-1 p-2 rounded-lg border cursor-pointer transition-colors
        ${isActive ? 'bg-[hsl(210,80%,55%,0.08)]' : isSelected ? 'bg-[hsl(222,20%,16%)]' : 'bg-[hsl(222,20%,13%)] hover:bg-[hsl(222,20%,15%)]'}
        ${borderColor}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={isSelected ? 0 : -1}
    >
      {/* Timestamp row */}
      <div className="flex items-center gap-1 mb-1.5">
        <TimestampInput
          value={cue.startSeconds}
          onChange={(v) => updateCue(cue.id, { startSeconds: v })}
        />
        <span className="text-[hsl(215,15%,40%)] text-xs">→</span>
        <TimestampInput
          value={cue.endSeconds}
          onChange={(v) => updateCue(cue.id, { endSeconds: v })}
        />
        {cue.edited && (
          <span className="ml-auto text-[8px] text-[hsl(210,80%,65%)] opacity-60">edited</span>
        )}
      </div>

      {/* Arabic text */}
      <div
        className="text-xs text-[hsl(215,15%,60%)] mb-1 font-arabic text-right leading-relaxed cursor-text"
        dir="rtl"
        onClick={(e) => { e.stopPropagation(); setEditingArabic(true) }}
      >
        {editingArabic ? (
          <textarea
            autoFocus
            defaultValue={cue.arabic}
            dir="rtl"
            className="w-full bg-[hsl(222,20%,10%)] border border-[hsl(220,15%,30%)] rounded px-1 py-0.5 text-xs font-arabic resize-none text-right"
            rows={2}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              updateCue(cue.id, { arabic: e.target.value })
              setEditingArabic(false)
            }}
          />
        ) : (
          <span className="block min-h-[1.5em]">{cue.arabic || <span className="opacity-30">Arabic text</span>}</span>
        )}
      </div>

      {/* English text */}
      <textarea
        ref={englishRef}
        defaultValue={cue.english}
        className="w-full bg-[hsl(222,20%,10%)] border border-[hsl(220,15%,25%)] rounded px-1.5 py-1 text-xs resize-none text-[hsl(210,20%,90%)] focus:outline-none focus:border-[hsl(210,80%,55%)] transition-colors"
        rows={2}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) => updateCue(cue.id, { english: e.target.value })}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-1 mt-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); mergeWithNext(cue.id) }}
          className="text-xs px-2 py-1 rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,50%)] hover:text-white hover:border-[hsl(220,15%,40%)] transition-colors"
          title="Merge with next (⌘M)"
        >
          merge↓
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteCue(cue.id) }}
          className="text-[9px] px-1.5 py-0.5 rounded border border-[hsl(220,15%,25%)] text-[hsl(215,15%,50%)] hover:text-red-400 hover:border-red-700/50 transition-colors"
          title="Delete"
        >
          ×
        </button>
        <span className="ml-auto text-[9px] text-[hsl(215,15%,35%)]">#{index + 1}</span>
      </div>
    </div>
  )
}

function toMmss(s: number): string {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(2).padStart(5, '0')
  return `${m}:${sec}`
}

function parseMmss(raw: string): number | null {
  const parts = raw.split(':')
  if (parts.length === 2) {
    const m = parseInt(parts[0])
    const s = parseFloat(parts[1])
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s
  }
  if (parts.length === 3) {
    const h = parseInt(parts[0])
    const m = parseInt(parts[1])
    const s = parseFloat(parts[2])
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) return h * 3600 + m * 60 + s
  }
  const fallback = parseFloat(raw)
  return isNaN(fallback) ? null : fallback
}

function TimestampInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  if (editing) {
    return (
      <input
        autoFocus
        value={raw}
        className="w-20 text-[10px] bg-[hsl(222,20%,10%)] border border-[hsl(210,80%,55%)] rounded px-1 text-center text-white font-mono"
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          const parsed = parseMmss(raw)
          if (parsed !== null) onChange(parsed)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <button
      className="text-[10px] text-[hsl(210,80%,65%)] hover:text-white font-mono px-0.5"
      onClick={(e) => { e.stopPropagation(); setRaw(toMmss(value)); setEditing(true) }}
    >
      {formatDuration(value)}
    </button>
  )
}
