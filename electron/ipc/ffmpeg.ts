import { ipcMain, BrowserWindow } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import path from 'path'
import fs from 'fs'

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}
ffmpeg.setFfprobePath(ffprobeStatic.path)

function sendProgress(win: BrowserWindow | null, data: unknown) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('ffmpeg:progress', data)
  }
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

ipcMain.handle('ffmpeg:getVideoDuration', (_event, videoPath: string): Promise<{ duration: number; hasAudio: boolean }> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err)
      const duration = metadata.format.duration ?? 0
      const hasAudio = (metadata.streams ?? []).some((s) => s.codec_type === 'audio')
      resolve({ duration, hasAudio })
    })
  })
})

ipcMain.handle('ffmpeg:extractAudio', (
  _event,
  videoPath: string,
  outputPath: string
): Promise<{ path: string; duration: number }> => {
  return new Promise((resolve, reject) => {
    const win = getMainWindow()
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    ffmpeg(videoPath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('flac')
      .output(outputPath)
      .on('progress', (p) => {
        sendProgress(win, { stage: 'extracting', percent: p.percent ?? 0 })
      })
      .on('end', () => {
        ffmpeg.ffprobe(outputPath, (err, meta) => {
          if (err) return reject(err)
          resolve({ path: outputPath, duration: meta.format.duration ?? 0 })
        })
      })
      .on('error', reject)
      .run()
  })
})

ipcMain.handle('ffmpeg:detectSilences', (_event, audioPath: string): Promise<number[]> => {
  return new Promise((resolve) => {
    const silences: number[] = []
    const stderr: string[] = []

    ffmpeg(audioPath)
      .audioFilters('silencedetect=n=-30dB:d=0.5')
      .format('null')
      .output('-')
      .on('stderr', (line: string) => {
        stderr.push(line)
        const match = line.match(/silence_end: ([\d.]+)/)
        if (match) silences.push(parseFloat(match[1]))
      })
      .on('end', () => resolve(silences))
      .on('error', () => resolve(silences))
      .run()
  })
})

ipcMain.handle('ffmpeg:splitAudio', (
  _event,
  audioPath: string,
  start: number,
  duration: number,
  outputPath: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Re-encode (not copy) so output timestamps always start at 0.
    // With copy + seek, the chunk retains original PTS which would make
    // Gemini timestamps double-count the offset on multi-chunk videos.
    ffmpeg(audioPath)
      .setStartTime(start)
      .setDuration(duration)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('flac')
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
})

ipcMain.handle('ffmpeg:exportClip', (
  _event,
  videoPath: string,
  srtPath: string,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
  opts: { fontSize?: number; position?: 'bottom' | 'center' | 'top'; background?: 'none' | 'semi' | 'solid'; logoPath?: string; logoPosition?: string; logoSize?: string; logoOpacity?: number }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const win = getMainWindow()
    const fontSize = opts.fontSize ?? 20
    const alignment = opts.position === 'top' ? 8 : opts.position === 'center' ? 5 : 2
    const marginV = opts.position === 'center' ? 0 : 30
    let borderStyle = '1'
    let backColour = ''
    if (opts.background === 'semi') { borderStyle = '4'; backColour = ',BackColour=&H80000000' }
    else if (opts.background === 'solid') { borderStyle = '4'; backColour = ',BackColour=&HCC000000' }

    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    const subtitleFilter = `subtitles=${escapedSrt}:force_style='FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=${borderStyle},Outline=2,Shadow=1,Alignment=${alignment},MarginV=${marginV}${backColour}'`

    const cmd = ffmpeg(videoPath)
      .setStartTime(startSeconds)
      .setDuration(durationSeconds)

    if (opts.logoPath && fs.existsSync(opts.logoPath)) {
      const logoW = opts.logoSize === 'small' ? 55 : opts.logoSize === 'large' ? 130 : 85
      const lx = opts.logoPosition?.includes('right') ? 'W-w-10' : '10'
      const ly = opts.logoPosition?.includes('bottom') ? 'H-h-40' : '10'
      const alpha = (opts.logoOpacity ?? 100) / 100
      const logoScale = alpha < 1
        ? `[1:v]scale=${logoW}:-1,format=rgba,colorchannelmixer=aa=${alpha}[logo]`
        : `[1:v]scale=${logoW}:-1[logo]`
      cmd.input(opts.logoPath)
        .outputOptions([
          '-filter_complex',
          `[0:v]crop=ih*9/16:ih,${subtitleFilter}[subbed];${logoScale};[subbed][logo]overlay=${lx}:${ly}`,
          '-map', '0:a',
          '-preset medium', '-crf 22', '-pix_fmt yuv420p',
        ])
        .videoCodec('libx264').audioCodec('aac')
    } else {
      cmd.videoFilters(['crop=ih*9/16:ih', subtitleFilter])
        .videoCodec('libx264').audioCodec('aac')
        .outputOptions(['-preset medium', '-crf 22', '-pix_fmt yuv420p'])
    }

    cmd.output(outputPath)
      .on('progress', (p) => sendProgress(win, { stage: 'export', percent: p.percent ?? 0 }))
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
})

ipcMain.handle('ffmpeg:exportSoftSubs', (
  _event,
  videoPath: string,
  srtPath: string,
  outputPath: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const win = getMainWindow()
    ffmpeg(videoPath)
      .input(srtPath)
      .outputOptions(['-c copy', '-c:s mov_text', '-metadata:s:s:0 language=eng'])
      .output(outputPath)
      .on('progress', (p) => sendProgress(win, { stage: 'export', percent: p.percent ?? 0 }))
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
})

ipcMain.handle('ffmpeg:exportHardSubs', (
  _event,
  videoPath: string,
  srtPath: string,
  outputPath: string,
  opts: {
    preset?: string
    crf?: number
    fontSize?: number
    position?: 'bottom' | 'center' | 'top'
    background?: 'none' | 'semi' | 'solid'
    includeArabic?: boolean
    arabicSrtPath?: string
    logoPath?: string
    logoPosition?: string
    logoSize?: string
    logoOpacity?: number
  }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const win = getMainWindow()
    const preset = opts.preset ?? 'medium'
    const crf = opts.crf ?? 20
    const fontSize = opts.fontSize ?? 22
    const alignment = opts.position === 'top' ? 8 : opts.position === 'center' ? 5 : 2
    const marginV = opts.position === 'center' ? 0 : 40

    let borderStyle = '1'
    let backColour = ''
    if (opts.background === 'semi') { borderStyle = '4'; backColour = ',BackColour=&H80000000' }
    else if (opts.background === 'solid') { borderStyle = '4'; backColour = ',BackColour=&HCC000000' }

    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    const subtitleFilter = `subtitles=${escapedSrt}:force_style='FontName=Inter,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=${borderStyle},Outline=2,Shadow=1,Alignment=${alignment},MarginV=${marginV}${backColour}'`

    const cmd = ffmpeg(videoPath)
    if (opts.logoPath && fs.existsSync(opts.logoPath)) {
      const logoW = opts.logoSize === 'small' ? 80 : opts.logoSize === 'large' ? 200 : 130
      const lx = opts.logoPosition?.includes('right') ? 'W-w-16' : '16'
      const ly = opts.logoPosition?.includes('bottom') ? 'H-h-16' : '16'
      const alpha = (opts.logoOpacity ?? 100) / 100
      const logoScale = alpha < 1
        ? `[1:v]scale=${logoW}:-1,format=rgba,colorchannelmixer=aa=${alpha}[logo]`
        : `[1:v]scale=${logoW}:-1[logo]`
      cmd.input(opts.logoPath)
        .outputOptions([
          '-filter_complex',
          `[0:v]${subtitleFilter}[subbed];${logoScale};[subbed][logo]overlay=${lx}:${ly}`,
          '-map', '0:a',
          `-preset ${preset}`, `-crf ${crf}`, '-pix_fmt yuv420p',
        ])
        .videoCodec('libx264').audioCodec('copy')
    } else {
      cmd.videoFilters(subtitleFilter)
        .videoCodec('libx264').audioCodec('copy')
        .outputOptions([`-preset ${preset}`, `-crf ${crf}`, '-pix_fmt yuv420p'])
    }

    cmd.output(outputPath)
      .on('progress', (p) => sendProgress(win, { stage: 'export', percent: p.percent ?? 0 }))
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
})
