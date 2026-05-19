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
}

export default function SubtitleTimeline({
  audioPath, cues, currentTime, duration, selectedCueId, onSeek, onSelectCue,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const updateCue = useProjectStore((s) => s.updateCue)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'hsl(210, 20%, 35%)',
      progressColor: 'hsl(210, 80%, 55%)',
      cursorColor: 'hsl(210, 80%, 70%)',
      height: 56,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      plugins: [regions],
    })
    wsRef.current = ws

    ws.load(toFileUrl(audioPath)).catch(() => {})

    ws.on('ready', () => setReady(true))

    ws.on('interaction', (newTime: number) => {
      if (ready) onSeek(newTime)
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

    return () => { ws.destroy() }
  }, [audioPath])

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
        color: selectedCueId === cue.id ? 'rgba(59, 130, 246, 0.3)' : 'rgba(100, 150, 255, 0.15)',
        drag: true,
        resize: true,
      })
    }
  }, [cues, selectedCueId])

  useEffect(() => {
    if (!wsRef.current || !ready) return
    const dur = wsRef.current.getDuration()
    if (dur > 0) wsRef.current.seekTo(currentTime / dur)
  }, [currentTime, ready])

  return (
    <div className="h-full flex flex-col bg-[hsl(222,20%,9%)] px-2 pt-1">
      <div className="text-[10px] text-[hsl(215,15%,35%)] mb-1 flex items-center gap-2">
        <span>Cue timing</span>
        {ready
          ? <span className="opacity-50">· drag region edges to adjust</span>
          : <span className="opacity-40">· loading audio…</span>
        }
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
