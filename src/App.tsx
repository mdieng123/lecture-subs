import { useEffect, useState } from 'react'
import { useProjectStore } from './state/projectStore'
import ImportScreen from './components/ImportScreen'
import ProcessingScreen from './components/ProcessingScreen'
import EditorScreen from './components/EditorScreen'
import ClipsScreen from './components/ClipsScreen'
import YoutubeScreen from './components/YoutubeScreen'

export default function App() {
  const screen = useProjectStore((s) => s.screen)
  const setHasApiKey = useProjectStore((s) => s.setHasApiKey)
  const setHasGroqKey = useProjectStore((s) => s.setHasGroqKey)
  const setSettings = useProjectStore((s) => s.setSettings)
  const setLogoSettings = useProjectStore((s) => s.setLogoSettings)
  const groqQuotaExhaustedAt = useProjectStore((s) => s.groqQuotaExhaustedAt)
  const setGroqQuotaExhaustedAt = useProjectStore((s) => s.setGroqQuotaExhaustedAt)
  const [quotaSecsLeft, setQuotaSecsLeft] = useState<number | null>(null)

  useEffect(() => {
    window.api.store.hasApiKey().then(setHasApiKey)
    window.api.store.hasGroqApiKey().then(setHasGroqKey)
    window.api.store.getSettings().then((s) => { if (s) setSettings(s) })
    Promise.all([
      window.api.store.getLogoSettings(),
      window.api.files.getLogoPath(),
    ]).then(([ls, logoPath]) => {
      setLogoSettings({ ...ls, path: logoPath })
    })

    const unsub = window.api.gemini.onChunkProgress((data: unknown) => {
      const d = data as { status?: string }
      if (d.status === 'quota_exhausted') {
        setGroqQuotaExhaustedAt(Date.now())
      }
    })
    return () => { unsub() }
  }, [])

  useEffect(() => {
    if (!groqQuotaExhaustedAt) { setQuotaSecsLeft(null); return }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - groqQuotaExhaustedAt) / 1000)
      const left = Math.max(0, 3600 - elapsed)
      setQuotaSecsLeft(left)
      if (left === 0) setGroqQuotaExhaustedAt(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [groqQuotaExhaustedAt])

  const mm = String(Math.floor((quotaSecsLeft ?? 0) / 60)).padStart(2, '0')
  const ss = String((quotaSecsLeft ?? 0) % 60).padStart(2, '0')

  return (
    <div className="h-screen flex flex-col bg-[hsl(222,20%,10%)] text-[hsl(210,20%,95%)] overflow-hidden">
      {quotaSecsLeft !== null && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-950/60 border-b border-red-800/50 flex-shrink-0 gap-4">
          <div className="text-xs text-red-300 flex items-center gap-3">
            <span className="font-medium">Groq quota exhausted</span>
            <span className="text-red-400/70">Full 120 min available when timer clears.</span>
            <span className="text-red-400/50 border border-red-800/60 rounded px-1.5 py-0.5">Don't quit — timer resets if you do</span>
          </div>
          <div className="font-mono font-bold text-red-300 tabular-nums flex-shrink-0">{mm}:{ss}</div>
        </div>
      )}
      {screen === 'import' && <ImportScreen />}
      {screen === 'processing' && <ProcessingScreen />}
      {screen === 'editor' && <EditorScreen />}
      {screen === 'clips' && <ClipsScreen />}
      {screen === 'youtube' && <YoutubeScreen />}
    </div>
  )
}
