import { useEffect, useRef, useState, RefObject } from 'react'
import { useProjectStore } from '../state/projectStore'
import type { Cue } from '../types'
import { toFileUrl } from '../utils'

interface Props {
  videoPath: string
  cues: Cue[]
  currentTime: number
  onTimeUpdate: (t: number) => void
  onCueSelect: (id: string) => void
  videoRef: RefObject<HTMLVideoElement | null>
  selectedCueId: string | null
}

const FONT_SIZE = { small: 'text-sm', medium: 'text-base', large: 'text-xl', xl: 'text-3xl', xxl: 'text-5xl' }
const BG_CLASS = { none: '', semi: 'bg-black/60', solid: 'bg-black/85' }
const LOGO_SIZE = { small: 'w-[8%]', medium: 'w-[13%]', large: 'w-[20%]' }
const LOGO_POS: Record<string, string> = {
  'top-left': 'top-3 left-3',
  'top-right': 'top-3 right-3',
  'bottom-left': 'bottom-16 left-3',
  'bottom-right': 'bottom-16 right-3',
}

export default function VideoPreview({
  videoPath, cues, currentTime, onTimeUpdate, onCueSelect, videoRef, selectedCueId,
}: Props) {
  const rafRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const style = useProjectStore((s) => s.subtitleStyle)
  const logo = useProjectStore((s) => s.logoSettings)
  const audioOnly = useProjectStore((s) => s.project?.audioOnly ?? false)
  const audioBackgroundPath = useProjectStore((s) => s.audioBackgroundPath)

  const activeCue = cues.find(
    (c) => currentTime >= c.startSeconds && currentTime < c.endSeconds
  ) ?? null

  function tick() {
    if (videoRef.current) {
      onTimeUpdate(videoRef.current.currentTime)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [videoRef])

  useEffect(() => {
    if (activeCue && activeCue.id !== selectedCueId) {
      onCueSelect(activeCue.id)
    }
  }, [activeCue?.id])

  const videoSrc = toFileUrl(videoPath)

  const posClass = style.position === 'top'
    ? 'top-12'
    : style.position === 'center'
    ? 'top-[42%] -translate-y-1/2'
    : 'bottom-12'
  const fontSize = FONT_SIZE[style.fontSize]
  const bgClass = BG_CLASS[style.background]

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-black overflow-hidden relative">
      <video
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        src={videoSrc}
        className="flex-1 w-full object-contain"
        controls={false}
        preload="metadata"
      />

      {audioOnly && audioBackgroundPath && (
        <img
          src={toFileUrl(audioBackgroundPath)}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          alt=""
        />
      )}

      {activeCue && (
        <div className={`absolute ${posClass} left-0 right-0 flex justify-center pointer-events-none`}>
          <div className="max-w-[85%] text-center space-y-0.5">
            {style.includeArabic && activeCue.arabic && (
              <div className={`${fontSize} ${bgClass} text-white px-2 py-0.5 rounded text-center`} dir="rtl">
                {activeCue.arabic}
              </div>
            )}
            <div
              className={`${fontSize} ${bgClass} text-white px-2 py-0.5 rounded text-center`}
              style={style.background === 'none' ? { textShadow: '0 1px 4px #000, 0 0 8px #000' } : undefined}
            >
              {activeCue.english}
            </div>
          </div>
        </div>
      )}

      {logo.enabled && logo.path && (
        <img
          src={toFileUrl(logo.path)}
          className={`absolute ${LOGO_POS[logo.position]} ${LOGO_SIZE[logo.size]} pointer-events-none`}
          style={{ opacity: (logo.opacity ?? 100) / 100 }}
          alt=""
        />
      )}

      <VideoControls videoRef={videoRef} currentTime={currentTime} />
    </div>
  )
}

function VideoControls({ videoRef, currentTime }: {
  videoRef: RefObject<HTMLVideoElement | null>
  currentTime: number
}) {
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onMeta = () => setDuration(el.duration || 0)
    el.addEventListener('loadedmetadata', onMeta)
    if (el.readyState >= 1) onMeta()
    return () => el.removeEventListener('loadedmetadata', onMeta)
  }, [videoRef])

  function toggle() {
    if (!videoRef.current) return
    if (videoRef.current.paused) videoRef.current.play()
    else videoRef.current.pause()
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    if (videoRef.current) {
      videoRef.current.currentTime = parseFloat(e.target.value)
    }
  }

  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  const fmt = (s: number) => `${pad(s / 60)}:${pad(s % 60)}`

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-2 bg-gradient-to-t from-black/80 to-transparent">
      <button
        onClick={toggle}
        className="text-white text-xl w-8 h-8 flex items-center justify-center flex-shrink-0"
      >
        {videoRef.current?.paused !== false ? '▶' : '⏸'}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={handleScrub}
        className="flex-1 h-1 accent-[hsl(210,80%,55%)]"
      />
      <span className="text-white text-xs whitespace-nowrap">
        {fmt(currentTime)} / {fmt(duration)}
      </span>
    </div>
  )
}
