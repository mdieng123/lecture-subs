import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { Cue } from '../types'
import { useProjectStore } from '../state/projectStore'

interface Props {
  audioPath: string
  cues: Cue[]
  currentTime: number
  duration: number
  selectedCueId: string | null
  onSeek: (t: number) => void
  onSelectCue: (id: string) => void
}

export default function SubtitleTimeline({
  audioPath, cues, currentTime, duration, selectedCueId, onSeek, onSelectCue,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const updateCue = useProjectStore((s) => s.updateCue)

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

    const audioSrc = audioPath.startsWith('/')
      ? `file://${encodeURI(audioPath)}`
      : audioPath
    ws.load(audioSrc).catch(() => {})

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

    // Remove old, add new
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

  return (
    <div className="h-full flex flex-col bg-[hsl(222,20%,9%)] px-2 py-1">
      <div className="text-[10px] text-[hsl(215,15%,40%)] mb-1 flex items-center gap-2">
        <span>Waveform</span>
        <span className="opacity-50">· drag region edges to adjust timing</span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
