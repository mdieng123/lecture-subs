import { app, BrowserWindow, ipcMain, shell, protocol, Menu, powerSaveBlocker } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Register before app.whenReady so the scheme is available immediately
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, standard: true, stream: true, bypassCSP: true } },
])

const isDev = !app.isPackaged
const tmpDir = path.join(os.tmpdir(), `lecture-subs-${process.pid}`)

// Dev env override — ONLY in dev mode
if (isDev && process.env.GEMINI_API_KEY) {
  console.log('Using GEMINI_API_KEY from env (dev mode)')
}

function cleanup() {
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true })
    }
  } catch {}
}

app.on('will-quit', cleanup)
process.on('uncaughtException', (err) => {
  cleanup()
  throw err
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#141820',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  // VITE_DEV_SERVER_URL is injected by vite-plugin-electron in dev mode
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
  ]))

  protocol.handle('local-file', async (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    const ext = path.extname(filePath).toLowerCase()
    const mime: Record<string, string> = {
      '.mp4': 'video/mp4', '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
    }
    const contentType = mime[ext] ?? 'application/octet-stream'
    try {
      const stat = await fs.promises.stat(filePath)
      const fileSize = stat.size
      const rangeHeader = request.headers.get('range')
      if (rangeHeader) {
        const m = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        const start = m ? parseInt(m[1]) : 0
        const end = m && m[2] ? parseInt(m[2]) : fileSize - 1
        const nodeStream = fs.createReadStream(filePath, { start, end })
        const webStream = new ReadableStream({
          start(ctrl) {
            nodeStream.on('data', (c) => ctrl.enqueue(c))
            nodeStream.on('end', () => ctrl.close())
            nodeStream.on('error', (e) => ctrl.error(e))
          },
          cancel() { nodeStream.destroy() },
        })
        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Content-Type': contentType,
          },
        })
      }
      const nodeStream = fs.createReadStream(filePath)
      const webStream = new ReadableStream({
        start(ctrl) {
          nodeStream.on('data', (c) => ctrl.enqueue(c))
          nodeStream.on('end', () => ctrl.close())
          nodeStream.on('error', (e) => ctrl.error(e))
        },
        cancel() { nodeStream.destroy() },
      })
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

// IPC handlers — registered from sub-modules
import './ipc/store'
import './ipc/files'
import './ipc/ffmpeg'
import './ipc/gemini'
import './ipc/youtube'

// Power management — prevent sleep during transcription
let powerBlockerId: number | null = null
ipcMain.handle('power:preventSleep', () => {
  if (powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  }
})
ipcMain.handle('power:allowSleep', () => {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId)
    powerBlockerId = null
  }
})

// Open external links safely
ipcMain.handle('shell:openExternal', (_event, url: string) => {
  const allowed = ['https://aistudio.google.com/apikey', 'https://console.groq.com/keys']
  if (allowed.includes(url)) {
    shell.openExternal(url)
  }
})

export { tmpDir, isDev }
