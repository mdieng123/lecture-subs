import { ipcMain, safeStorage } from 'electron'
import Store from 'electron-store'
import { isDev } from '../main'

interface StoreSchema {
  encryptedApiKey?: string;
  encryptedGroqApiKey?: string;
  model?: string;
  chunkMinutes?: number;
  maxConcurrentChunks?: number;
  showCostEstimate?: boolean;
  logoPosition?: string;
  logoSize?: string;
  logoEnabled?: boolean;
}

const store = new Store<StoreSchema>()

const API_KEY_STORE_KEY = 'encryptedApiKey'

function scrubError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err)
  // Remove anything that looks like an API key
  const scrubbed = msg.replace(/AIza[A-Za-z0-9_-]{35}/g, '[REDACTED]')
    .replace(/key=[A-Za-z0-9_-]+/gi, 'key=[REDACTED]')
  return new Error(scrubbed)
}

ipcMain.handle('store:setApiKey', (_event, key: string) => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key)
      store.set(API_KEY_STORE_KEY, encrypted.toString('base64'))
    } else {
      // Fallback: warn but still encrypt as base64 (better than nothing for dev)
      console.warn('safeStorage encryption not available — using base64 fallback')
      store.set(API_KEY_STORE_KEY, Buffer.from(key).toString('base64'))
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: scrubError(err).message }
  }
})

ipcMain.handle('store:getApiKey', () => {
  try {
    // 1. Check safeStorage first
    const stored = store.get(API_KEY_STORE_KEY) as string | undefined
    if (stored) {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(stored, 'base64'))
      } else {
        return Buffer.from(stored, 'base64').toString('utf-8')
      }
    }
    // 2. Dev fallback
    if (!app_isPackaged() && process.env.GEMINI_API_KEY) {
      return process.env.GEMINI_API_KEY
    }
    return null
  } catch {
    return null
  }
})

ipcMain.handle('store:hasApiKey', () => {
  const stored = store.get(API_KEY_STORE_KEY) as string | undefined
  if (stored) return true
  if (!app_isPackaged() && process.env.GEMINI_API_KEY) return true
  return false
})

ipcMain.handle('store:deleteApiKey', () => {
  store.delete(API_KEY_STORE_KEY)
  return { ok: true }
})

const GROQ_KEY_STORE_KEY = 'encryptedGroqApiKey'

ipcMain.handle('store:setGroqApiKey', (_event, key: string) => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      store.set(GROQ_KEY_STORE_KEY, safeStorage.encryptString(key).toString('base64'))
    } else {
      store.set(GROQ_KEY_STORE_KEY, Buffer.from(key).toString('base64'))
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: scrubError(err).message }
  }
})

ipcMain.handle('store:getGroqApiKey', () => {
  try {
    const stored = store.get(GROQ_KEY_STORE_KEY) as string | undefined
    if (stored) {
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(stored, 'base64'))
        : Buffer.from(stored, 'base64').toString('utf-8')
    }
    if (!app_isPackaged() && process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY
    return null
  } catch { return null }
})

ipcMain.handle('store:hasGroqApiKey', () => {
  if (store.get(GROQ_KEY_STORE_KEY)) return true
  if (!app_isPackaged() && process.env.GROQ_API_KEY) return true
  return false
})

ipcMain.handle('store:deleteGroqApiKey', () => {
  store.delete(GROQ_KEY_STORE_KEY)
  return { ok: true }
})

ipcMain.handle('store:getSettings', () => {
  return {
    model: store.get('model', 'gemini-2.5-pro'),
    chunkMinutes: store.get('chunkMinutes', 15),
    maxConcurrentChunks: store.get('maxConcurrentChunks', 3),
    showCostEstimate: store.get('showCostEstimate', true),
  }
})

ipcMain.handle('store:setSettings', (_event, s: Partial<StoreSchema>) => {
  if (s.model !== undefined) store.set('model', s.model)
  if (s.chunkMinutes !== undefined) store.set('chunkMinutes', s.chunkMinutes)
  if (s.maxConcurrentChunks !== undefined) store.set('maxConcurrentChunks', s.maxConcurrentChunks)
  if (s.showCostEstimate !== undefined) store.set('showCostEstimate', s.showCostEstimate)
  return { ok: true }
})

ipcMain.handle('store:getLogoSettings', () => ({
  position: store.get('logoPosition', 'top-right'),
  size: store.get('logoSize', 'medium'),
  enabled: store.get('logoEnabled', false),
}))

ipcMain.handle('store:setLogoSettings', (_event, s: { position?: string; size?: string; enabled?: boolean }) => {
  if (s.position !== undefined) store.set('logoPosition', s.position)
  if (s.size !== undefined) store.set('logoSize', s.size)
  if (s.enabled !== undefined) store.set('logoEnabled', s.enabled)
  return { ok: true }
})

// Helper to check isPackaged without circular import
function app_isPackaged(): boolean {
  try {
    const { app } = require('electron')
    return app.isPackaged
  } catch {
    return false
  }
}

export { scrubError }
