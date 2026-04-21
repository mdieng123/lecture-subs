import { useState, useEffect, useCallback } from 'react'
import { useProjectStore } from '../state/projectStore'
import type { Settings } from '../types'

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useProjectStore((s) => s.settings)
  const setSettings = useProjectStore((s) => s.setSettings)
  const setHasApiKey = useProjectStore((s) => s.setHasApiKey)
  const setStoreHasGroqKey = useProjectStore((s) => s.setHasGroqKey)

  const [apiKey, setApiKey] = useState('')
  const [keyStatus, setKeyStatus] = useState<'idle' | 'saved' | 'deleted'>('idle')
  const [saving, setSaving] = useState(false)
  const [groqKey, setGroqKey] = useState('')
  const [groqKeyStatus, setGroqKeyStatus] = useState<'idle' | 'saved' | 'deleted'>('idle')
  const [groqSaving, setGroqSaving] = useState(false)
  const [hasGroqKey, setHasGroqKey] = useState(false)

  useEffect(() => {
    window.api.store.hasGroqApiKey().then((v: boolean) => setHasGroqKey(v))
  }, [])

  useEffect(() => {
    // Don't pre-fill the key — show empty per spec
    setApiKey('')
  }, [])

  async function handleSaveKey() {
    if (!apiKey.trim()) return
    setSaving(true)
    const result = await window.api.store.setApiKey(apiKey.trim())
    if (result.ok) {
      setKeyStatus('saved')
      setHasApiKey(true)
      setApiKey('')
    }
    setSaving(false)
  }

  async function handleDeleteKey() {
    await window.api.store.deleteApiKey()
    setKeyStatus('deleted')
    setHasApiKey(false)
  }

  async function handleSaveGroqKey() {
    if (!groqKey.trim()) return
    setGroqSaving(true)
    const result = await window.api.store.setGroqApiKey(groqKey.trim())
    if (result.ok) { setGroqKeyStatus('saved'); setHasGroqKey(true); setStoreHasGroqKey(true); setGroqKey('') }
    setGroqSaving(false)
  }

  async function handleDeleteGroqKey() {
    await window.api.store.deleteGroqApiKey()
    setGroqKeyStatus('deleted')
    setHasGroqKey(false)
    setStoreHasGroqKey(false)
  }

  async function handleSettingChange(patch: Partial<Settings>) {
    setSettings(patch)
    await window.api.store.setSettings(patch as Record<string, unknown>)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[hsl(222,20%,14%)] border border-[hsl(220,15%,22%)] rounded-xl w-[460px] shadow-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0 border-b border-[hsl(220,15%,20%)]">
          <h2 className="text-base font-semibold">Settings</h2>
          <button onClick={onClose} className="text-[hsl(215,15%,50%)] hover:text-white text-xl">×</button>
        </div>

        <div className="space-y-5 overflow-y-auto flex-1 px-6 py-4">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-2 text-[hsl(210,20%,80%)]">
              Gemini API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyStatus('idle') }}
                placeholder="Enter your API key..."
                className="flex-1 bg-[hsl(222,20%,18%)] border border-[hsl(220,15%,25%)] rounded-lg px-3 py-2 text-sm text-[hsl(210,20%,90%)] placeholder:text-[hsl(215,15%,35%)] focus:outline-none focus:border-[hsl(210,80%,55%)] transition-colors"
              />
              <button
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || saving}
                className="px-4 py-2 text-sm rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              {keyStatus === 'saved' && <span className="text-xs text-green-400">Key saved securely</span>}
              {keyStatus === 'deleted' && <span className="text-xs text-[hsl(215,15%,50%)]">Key removed</span>}
              {keyStatus === 'idle' && <span className="text-xs text-[hsl(215,15%,45%)]">Stored in OS keychain — never written to disk</span>}
              <button
                onClick={handleDeleteKey}
                className="text-xs text-[hsl(215,15%,40%)] hover:text-red-400 transition-colors"
              >
                Remove key
              </button>
            </div>
            <div className="mt-1">
              <button
                onClick={() => window.api.shell.openExternal('https://aistudio.google.com/apikey')}
                className="text-xs text-[hsl(210,80%,55%)] hover:underline"
              >
                Get a Gemini API key →
              </button>
            </div>
          </div>

          {/* Groq API Key */}
          <div>
            <label className="block text-sm font-medium mb-1 text-[hsl(210,20%,80%)]">
              Groq API Key
              <span className="ml-2 text-xs font-normal text-[hsl(130,50%,55%)]">
                {hasGroqKey ? '● active — faster + accurate timestamps' : '○ optional — enables Groq Whisper for better sync'}
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={groqKey}
                onChange={(e) => { setGroqKey(e.target.value); setGroqKeyStatus('idle') }}
                placeholder="Enter your Groq API key..."
                className="flex-1 bg-[hsl(222,20%,18%)] border border-[hsl(220,15%,25%)] rounded-lg px-3 py-2 text-sm text-[hsl(210,20%,90%)] placeholder:text-[hsl(215,15%,35%)] focus:outline-none focus:border-[hsl(210,80%,55%)] transition-colors"
              />
              <button
                onClick={handleSaveGroqKey}
                disabled={!groqKey.trim() || groqSaving}
                className="px-4 py-2 text-sm rounded-lg bg-[hsl(210,80%,55%)] hover:bg-[hsl(210,80%,48%)] text-white font-medium disabled:opacity-40 transition-colors"
              >
                {groqSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              {groqKeyStatus === 'saved' && <span className="text-xs text-green-400">Groq key saved securely</span>}
              {groqKeyStatus === 'deleted' && <span className="text-xs text-[hsl(215,15%,50%)]">Groq key removed</span>}
              {groqKeyStatus === 'idle' && <span className="text-xs text-[hsl(215,15%,45%)]">Stored in OS keychain — never written to disk</span>}
              <button onClick={handleDeleteGroqKey} className="text-xs text-[hsl(215,15%,40%)] hover:text-red-400 transition-colors">
                Remove key
              </button>
            </div>
            <button
              onClick={() => window.api.shell.openExternal('https://console.groq.com/keys')}
              className="text-xs text-[hsl(210,80%,55%)] hover:underline mt-1 block"
            >
              Get a Groq API key →
            </button>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium mb-2 text-[hsl(210,20%,80%)]">Model</label>
            <select
              value={settings.model}
              onChange={(e) => handleSettingChange({ model: e.target.value as Settings['model'] })}
              className="w-full bg-[hsl(222,20%,18%)] border border-[hsl(220,15%,25%)] rounded-lg px-3 py-2 text-sm text-[hsl(210,20%,80%)] focus:outline-none focus:border-[hsl(210,80%,55%)]"
            >
              <option value="gemini-2.5-pro">gemini-2.5-pro (higher quality, ~$1.50/hr)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (faster, ~10× cheaper, ~$0.20/hr)</option>
            </select>
          </div>

          {/* Chunk length */}
          <div>
            <label className="block text-sm font-medium mb-2 text-[hsl(210,20%,80%)]">
              Chunk length: <span className="text-[hsl(210,80%,65%)]">{settings.chunkMinutes} min</span>
            </label>
            <input
              type="range"
              min={5}
              max={30}
              step={5}
              value={settings.chunkMinutes}
              onChange={(e) => handleSettingChange({ chunkMinutes: parseInt(e.target.value, 10) })}
              className="w-full accent-[hsl(210,80%,55%)]"
            />
            <div className="flex justify-between text-[10px] text-[hsl(215,15%,40%)] mt-0.5">
              <span>5 min</span><span>30 min</span>
            </div>
          </div>

          {/* Max concurrent chunks */}
          <div>
            <label className="block text-sm font-medium mb-2 text-[hsl(210,20%,80%)]">
              Max concurrent chunks: <span className="text-[hsl(210,80%,65%)]">{settings.maxConcurrentChunks}</span>
            </label>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.maxConcurrentChunks}
              onChange={(e) => handleSettingChange({ maxConcurrentChunks: parseInt(e.target.value, 10) })}
              className="w-full accent-[hsl(210,80%,55%)]"
            />
            <div className="flex justify-between text-[10px] text-[hsl(215,15%,40%)] mt-0.5">
              <span>1</span><span>5</span>
            </div>
          </div>

          {/* Logo watermark */}
          <LogoSection />

          {/* YouTube downloads storage */}
          <DownloadsSection />

          {/* Cost estimate toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showCostEstimate}
              onChange={(e) => handleSettingChange({ showCostEstimate: e.target.checked })}
              className="accent-[hsl(210,80%,55%)]"
            />
            <span className="text-sm text-[hsl(210,20%,80%)]">Show cost estimate before processing</span>
          </label>
        </div>

        <div className="flex justify-end px-6 pb-6 pt-4 flex-shrink-0 border-t border-[hsl(220,15%,20%)]">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm rounded-lg bg-[hsl(222,20%,22%)] hover:bg-[hsl(222,20%,28%)] text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function LogoSection() {
  const logoSettings = useProjectStore((s) => s.logoSettings)
  const setLogoSettings = useProjectStore((s) => s.setLogoSettings)

  async function handlePickLogo() {
    const logoPath = await window.api.files.pickLogo()
    if (logoPath) {
      setLogoSettings({ path: logoPath, enabled: true })
      await window.api.store.setLogoSettings({ enabled: true })
    }
  }

  async function handleRemoveLogo() {
    await window.api.files.deleteLogo()
    setLogoSettings({ path: null, enabled: false })
    await window.api.store.setLogoSettings({ enabled: false })
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-[hsl(210,20%,80%)]">
        Logo Watermark
        <span className="ml-2 text-xs font-normal text-[hsl(215,15%,45%)]">position &amp; size in the editor toolbar</span>
      </label>
      {logoSettings.path ? (
        <div className="flex items-center gap-3">
          <img src={`file://${logoSettings.path}`} className="h-10 w-auto rounded border border-[hsl(220,15%,25%)]" alt="logo" />
          <span className="text-xs text-green-400">Uploaded</span>
          <button onClick={handlePickLogo} className="text-xs text-[hsl(215,15%,45%)] hover:text-white">Replace</button>
          <button onClick={handleRemoveLogo} className="ml-auto text-xs text-[hsl(215,15%,40%)] hover:text-red-400">Remove</button>
        </div>
      ) : (
        <button
          onClick={handlePickLogo}
          className="px-4 py-2 text-sm rounded-lg border border-dashed border-[hsl(220,15%,30%)] text-[hsl(215,15%,50%)] hover:text-white hover:border-[hsl(220,15%,45%)] transition-colors"
        >
          + Upload logo image
        </button>
      )}
    </div>
  )
}

function DownloadsSection() {
  const [bytes, setBytes] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)

  const refresh = useCallback(() => {
    window.api.files.getDownloadsSize().then(setBytes)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function fmt(b: number) {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  async function handleClear() {
    setClearing(true)
    await window.api.files.clearDownloads()
    refresh()
    setClearing(false)
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-[hsl(210,20%,80%)]">YouTube Downloads</label>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[hsl(215,15%,50%)]">
          {bytes === null ? 'Calculating...' : bytes === 0 ? 'No downloads stored' : `${fmt(bytes)} stored`}
        </span>
        <button
          onClick={handleClear}
          disabled={clearing || bytes === 0}
          className="text-xs text-[hsl(215,15%,40%)] hover:text-red-400 disabled:opacity-40 transition-colors"
        >
          {clearing ? 'Clearing...' : 'Clear all'}
        </button>
      </div>
    </div>
  )
}
