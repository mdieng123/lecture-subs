import { useEffect } from 'react'
import { useProjectStore } from './state/projectStore'
import ImportScreen from './components/ImportScreen'
import ProcessingScreen from './components/ProcessingScreen'
import EditorScreen from './components/EditorScreen'
import ClipsScreen from './components/ClipsScreen'

export default function App() {
  const screen = useProjectStore((s) => s.screen)
  const setHasApiKey = useProjectStore((s) => s.setHasApiKey)
  const setHasGroqKey = useProjectStore((s) => s.setHasGroqKey)
  const setSettings = useProjectStore((s) => s.setSettings)
  const setLogoSettings = useProjectStore((s) => s.setLogoSettings)

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
  }, [])

  return (
    <div className="h-screen flex flex-col bg-[hsl(222,20%,10%)] text-[hsl(210,20%,95%)] overflow-hidden">
      {screen === 'import' && <ImportScreen />}
      {screen === 'processing' && <ProcessingScreen />}
      {screen === 'editor' && <EditorScreen />}
      {screen === 'clips' && <ClipsScreen />}
    </div>
  )
}
