import { useRef, useEffect, useState, RefObject } from 'react'
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
  const selectedIdx = cues.findIndex((c) => c.id === selectedCueId)

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

  // Auto-scroll to selected cue
  useEffect(() => {
    if (selectedIdx >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedIdx, 'smart')
    }
  }, [selectedIdx])

  const ROW_HEIGHT = 125

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden bg-[hsl(222,20%,11%)] flex flex-col">
      <div className="flex-shrink-0 px-3 py-2 border-b border-[hsl(220,15%,22%)] text-xs text-[hsl(215,15%,45%)] flex items-center justify-between">
        <span>{cues.length} cues</span>
        <span className="text-[hsl(215,15%,35%)]">Click to seek</span>
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
