import { ipcMain, BrowserWindow, app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import ffmpegStatic from 'ffmpeg-static'

let activeDownload: ChildProcess | null = null

function getYtDlpPath(): string {
  const prod = path.join(process.resourcesPath ?? '', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  if (fs.existsSync(prod)) return prod
  return path.join(app.getAppPath(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

ipcMain.handle('youtube:download', (_event, url: string, outputDir: string): Promise<{ filePath: string; title: string }> => {
  return new Promise((resolve, reject) => {
    const ytdlp = getYtDlpPath()
    if (!fs.existsSync(ytdlp)) {
      return reject(new Error('yt-dlp binary not found. Run npm install to download it.'))
    }

    fs.mkdirSync(outputDir, { recursive: true })

    // Use a fixed stem so we always know where to look — ext resolved at runtime
    const outputTemplate = path.join(outputDir, 'video.%(ext)s')
    const win = getMainWindow()
    let title = ''

    const ffmpegDir = ffmpegStatic ? path.dirname(ffmpegStatic) : ''

    const proc = spawn(ytdlp, [
      url,
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--output', outputTemplate,
      '--no-playlist',
      '--newline',
      '--print', 'before_dl:%(title)s',
      ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
    ])

    activeDownload = proc

    proc.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        const progressMatch = line.match(/\[download\]\s+([\d.]+)%/)
        if (progressMatch) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('youtube:progress', { percent: parseFloat(progressMatch[1]) })
          }
        } else if (!line.startsWith('[') && !title) {
          // First non-bracket line is the --print before_dl title
          title = line.trim()
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line && win && !win.isDestroyed()) {
        win.webContents.send('youtube:progress', { status: line })
      }
    })

    proc.on('close', (code) => {
      activeDownload = null
      if (code !== 0 && code !== null) {
        return reject(new Error(`yt-dlp exited with code ${code}`))
      }

      // Find the downloaded file — ignore temp files yt-dlp leaves behind
      let filePath = ''
      try {
        const all = fs.readdirSync(outputDir).filter(f =>
          !f.endsWith('.part') && !f.endsWith('.ytdl') && !f.endsWith('.temp')
        )
        // Prefer mp4, then any video container, then whatever's left
        const pick = all.find(f => f.endsWith('.mp4'))
          ?? all.find(f => /\.(mkv|webm|mov|avi)$/.test(f))
          ?? all[0]
        if (pick) filePath = path.join(outputDir, pick)
      } catch {}

      if (!filePath || !fs.existsSync(filePath)) {
        return reject(new Error('Download completed but output file not found.'))
      }

      resolve({ filePath, title: title || path.basename(filePath, path.extname(filePath)) })
    })

    proc.on('error', (err) => {
      activeDownload = null
      reject(err)
    })
  })
})

ipcMain.handle('youtube:cancel', () => {
  if (activeDownload) {
    activeDownload.kill()
    activeDownload = null
  }
})
