#!/usr/bin/env node
import { createWriteStream, existsSync, chmodSync, mkdirSync } from 'fs'
import { get } from 'https'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binDir = join(__dirname, '..', 'bin')
const platform = process.platform

const BINARIES = {
  darwin: { url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos', name: 'yt-dlp' },
  linux:  { url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',       name: 'yt-dlp' },
  win32:  { url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',   name: 'yt-dlp.exe' },
}

const entry = BINARIES[platform]
if (!entry) {
  console.log(`yt-dlp: unsupported platform ${platform}, skipping`)
  process.exit(0)
}

const dest = join(binDir, entry.name)
if (existsSync(dest)) {
  console.log(`yt-dlp already present at ${dest}`)
  process.exit(0)
}

mkdirSync(binDir, { recursive: true })

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, destPath).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      const file = createWriteStream(destPath)
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    }).on('error', reject)
  })
}

console.log(`Downloading yt-dlp for ${platform}...`)
download(entry.url, dest)
  .then(() => {
    if (platform !== 'win32') chmodSync(dest, 0o755)
    console.log(`yt-dlp downloaded to ${dest}`)
  })
  .catch((err) => {
    console.error(`Failed to download yt-dlp: ${err.message}`)
    process.exit(1)
  })
