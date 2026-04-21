import { ipcMain, dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'

const pid = process.pid

ipcMain.handle('files:getTmpDir', () => {
  const dir = path.join(os.tmpdir(), `lecture-subs-${pid}`)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
})

ipcMain.handle('files:openVideo', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Video',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('files:saveFile', async (_event, opts: {
  defaultPath: string
  filters: { name: string; extensions: string[] }[]
}) => {
  const result = await dialog.showSaveDialog({
    defaultPath: opts.defaultPath,
    filters: opts.filters,
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

ipcMain.handle('files:openAny', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Video or Project',
    filters: [
      { name: 'All Supported', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'lecturesubs'] },
      { name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] },
      { name: 'LectureSubs Project', extensions: ['lecturesubs'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('files:openProject', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Project',
    filters: [{ name: 'LectureSubs Project', extensions: ['lecturesubs'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return fs.readFileSync(result.filePaths[0], 'utf-8')
})

ipcMain.handle('files:saveProject', async (_event, data: string, filePath?: string) => {
  let savePath = filePath
  if (!savePath) {
    const result = await dialog.showSaveDialog({
      title: 'Save Project',
      defaultPath: 'project.lecturesubs',
      filters: [{ name: 'LectureSubs Project', extensions: ['lecturesubs'] }],
    })
    if (result.canceled || !result.filePath) return null
    savePath = result.filePath
  }
  fs.writeFileSync(savePath, data, 'utf-8')
  return savePath
})

ipcMain.handle('files:pickFolder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Export Folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

const DOWNLOADS_DIR = path.join(app.getPath('userData'), 'downloads')

ipcMain.handle('files:getDownloadsDir', () => {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
  return DOWNLOADS_DIR
})

ipcMain.handle('files:getDownloadsSize', () => {
  if (!fs.existsSync(DOWNLOADS_DIR)) return 0
  let total = 0
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else total += fs.statSync(full).size
    }
  }
  walk(DOWNLOADS_DIR)
  return total
})

ipcMain.handle('files:clearDownloads', () => {
  if (fs.existsSync(DOWNLOADS_DIR)) {
    fs.rmSync(DOWNLOADS_DIR, { recursive: true })
    fs.mkdirSync(DOWNLOADS_DIR)
  }
  return { ok: true }
})

ipcMain.handle('files:exists', (_event, filePath: string) => {
  return fs.existsSync(filePath)
})

ipcMain.handle('files:mkdir', (_event, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
  return { ok: true }
})

ipcMain.handle('files:readFile', (_event, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('files:writeFile', (_event, filePath: string, data: string) => {
  fs.writeFileSync(filePath, data, 'utf-8')
  return { ok: true }
})

const LOGO_DEST = path.join(app.getPath('userData'), 'logo.png')

ipcMain.handle('files:pickLogo', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Logo Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const src = result.filePaths[0]
  fs.copyFileSync(src, LOGO_DEST)
  return LOGO_DEST
})

ipcMain.handle('files:getLogoPath', () => {
  return fs.existsSync(LOGO_DEST) ? LOGO_DEST : null
})

ipcMain.handle('files:deleteLogo', () => {
  if (fs.existsSync(LOGO_DEST)) fs.unlinkSync(LOGO_DEST)
  return { ok: true }
})

