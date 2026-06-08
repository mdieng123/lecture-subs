import { useRef, useEffect, useState, useMemo, RefObject } from 'react'
import { FixedSizeList as List } from 'react-window'
import type { Cue } from '../types'
import CueRow from './CueRow'

interface Props {
  cues: Cue[]
  currentTime: number
  selectedCueId: string | null
  onSelectCue: (id: string) => void
  videoRef: RefObject<HTMLVideoElement | null>
}

export default function CueList({ cues, currentTime, selectedCueId, onSelectCue, videoRef }: Props) {
  const listRef = useRef<List | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [listHeight, setListHeight] = useState(500)
  const [search, setSearch] = useState('')
  const selectedIdx = cues.findIndex((c) => c.id === selectedCueId)

  const trimmedSearch = search.trim()
  const matches = useMemo(() => {
    if (!trimmedSearch) return { ids: new Set<string>(), firstIdx: -1 }
    const needle = trimmedSearch.toLowerCase()
    const ids = new Set<string>()
    let firstIdx = -1
    cues.forEach((c, i) => {
      const en = (c.english ?? '').toLowerCase()
      const ar = c.arabic ?? ''
      if (en.includes(needle) || ar.includes(trimmedSearch)) {
        ids.add(c.id)
        if (firstIdx === -1) firstIdx = i
      }
    })
    return { ids, firstIdx }
  }, [cues, trimmedSearch])

  // Dynamic height via ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 500
      setListHeight(Math.max(h - 36, 100)) // subtract header height
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Auto-scroll: prefer first search match when actively searching; otherwise track selection
  useEffect(() => {
    if (!listRef.current) return
    if (trimmedSearch && matches.firstIdx >= 0) {
      listRef.current.scrollToItem(matches.firstIdx, 'start')
    } else if (selectedIdx >= 0) {
      listRef.current.scrollToItem(selectedIdx, 'smart')
    }
  }, [selectedIdx, trimmedSearch, matches.firstIdx])

  const ROW_HEIGHT = 125

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden bg-[hsl(222,20%,11%)] flex flex-col">
      <div className="flex-shrink-0 px-3 py-2 border-b border-[hsl(220,15%,22%)] text-xs text-[hsl(215,15%,45%)] flex items-center gap-2">
        <span className="whitespace-nowrap">{cues.length} cues</span>
        <div className="flex-1 relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Arabic or translation…"
            className="w-full bg-[hsl(222,20%,9%)] border border-[hsl(220,15%,22%)] rounded px-2 py-1 text-xs text-[hsl(210,20%,80%)] placeholder-[hsl(215,15%,35%)] focus:outline-none focus:border-[hsl(210,80%,55%)] transition-colors"
          />
        </div>
        {trimmedSearch && (
          <span className="whitespace-nowrap text-[hsl(215,15%,50%)]">
            {matches.ids.size} match{matches.ids.size === 1 ? '' : 'es'}
          </span>
        )}
      </div>
      <List
        ref={listRef}
        height={listHeight}
        width="100%"
        itemCount={cues.length}
        itemSize={ROW_HEIGHT}
        overscanCount={5}
      >
        {({ index, style }) => (
          <div style={style}>
            <CueRow
              cue={cues[index]}
              isSelected={cues[index].id === selectedCueId}
              isActive={currentTime >= cues[index].startSeconds && currentTime < cues[index].endSeconds}
              isMatch={matches.ids.has(cues[index].id)}
              index={index}
              onSelect={() => onSelectCue(cues[index].id)}
              videoRef={videoRef}
              cues={cues}
            />
          </div>
        )}
      </List>
    </div>
  )
}
