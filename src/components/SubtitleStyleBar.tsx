import { useProjectStore } from '../state/projectStore'
import type { SubtitleStyle, LogoSettings } from '../types'

export default function SubtitleStyleBar() {
  const style = useProjectStore((s) => s.subtitleStyle)
  const setSubtitleStyle = useProjectStore((s) => s.setSubtitleStyle)
  const logo = useProjectStore((s) => s.logoSettings)
  const setLogoSettings = useProjectStore((s) => s.setLogoSettings)

  function toggle<K extends keyof SubtitleStyle>(key: K, values: SubtitleStyle[K][]) {
    const idx = values.indexOf(style[key] as SubtitleStyle[K])
    setSubtitleStyle({ [key]: values[(idx + 1) % values.length] } as Partial<SubtitleStyle>)
  }

  async function persistLogo(patch: Partial<LogoSettings>) {
    setLogoSettings(patch)
    await window.api.store.setLogoSettings(patch as Record<string, unknown>)
  }

  const btnClass = 'px-2 py-0.5 text-xs rounded border border-[hsl(220,15%,28%)] hover:bg-[hsl(222,20%,22%)] text-[hsl(210,15%,70%)] transition-colors select-none cursor-pointer'
  const activeBtn = `${btnClass} border-[hsl(210,60%,50%)] text-[hsl(210,80%,70%)] bg-[hsl(210,30%,18%)]`

  const POSITIONS: LogoSettings['position'][] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
  const POS_LABEL: Record<string, string> = { 'top-left': '↖', 'top-right': '↗', 'bottom-left': '↙', 'bottom-right': '↘' }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[hsl(220,15%,22%)] bg-[hsl(222,20%,11%)] flex-shrink-0 flex-wrap">
      {/* Subtitle controls */}
      <span className="text-[10px] text-[hsl(215,15%,40%)] uppercase tracking-wider mr-1">Subtitles</span>
      <button className={btnClass} onClick={() => toggle('fontSize', ['small', 'medium', 'large', 'xl', 'xxl'])}>
        Size: {style.fontSize}
      </button>
      <button className={btnClass} onClick={() => toggle('position', ['bottom', 'center', 'top'])}>
        {style.position === 'bottom' ? '⬇ Bottom' : style.position === 'center' ? '↕ Center' : '⬆ Top'}
      </button>
      <button className={btnClass} onClick={() => toggle('background', ['none', 'semi', 'solid'])}>
        BG: {style.background}
      </button>
      <button
        className={`${btnClass} ${style.includeArabic ? 'border-[hsl(210,60%,50%)] text-[hsl(210,80%,70%)]' : ''}`}
        onClick={() => setSubtitleStyle({ includeArabic: !style.includeArabic })}
      >
        Arabic {style.includeArabic ? 'on' : 'off'}
      </button>

      {/* Logo controls — only shown when logo is uploaded */}
      {logo.path && (
        <>
          <div className="w-px h-4 bg-[hsl(220,15%,28%)] mx-1" />
          <span className="text-[10px] text-[hsl(215,15%,40%)] uppercase tracking-wider mr-1">Logo</span>

          <button
            className={logo.enabled ? activeBtn : btnClass}
            onClick={() => persistLogo({ enabled: !logo.enabled })}
          >
            {logo.enabled ? 'on' : 'off'}
          </button>

          {logo.enabled && (
            <>
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  title={pos}
                  className={logo.position === pos ? activeBtn : btnClass}
                  onClick={() => persistLogo({ position: pos })}
                >
                  {POS_LABEL[pos]}
                </button>
              ))}

              <button className={btnClass} onClick={() => {
                const sizes: LogoSettings['size'][] = ['small', 'medium', 'large']
                const next = sizes[(sizes.indexOf(logo.size) + 1) % sizes.length]
                persistLogo({ size: next })
              }}>
                {logo.size}
              </button>

              <button className={btnClass} onClick={() => {
                const opacities: LogoSettings['opacity'][] = [100, 75, 50, 25]
                const next = opacities[(opacities.indexOf(logo.opacity) + 1) % opacities.length]
                persistLogo({ opacity: next })
              }}>
                {logo.opacity}%
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
