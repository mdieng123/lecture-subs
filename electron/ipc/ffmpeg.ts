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

ipcMain.handle('ffmpeg:prependIntro', (
  _event,
  introPath: string,
  mainPath: string,
  outputPath: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const win = getMainWindow()
    ffmpeg.ffprobe(introPath, (err, introMeta) => {
      if (err) return reject(err)
      const introDur = introMeta.format.duration ?? 0
      const fadeSt = Math.max(0, introDur - 0.5).toFixed(3)
      const introHasAudio = introMeta.streams.some((s) => s.codec_type === 'audio')

      ffmpeg.ffprobe(mainPath, (err2, mainMeta) => {
        if (err2) return reject(err2)
        const vStream = mainMeta.streams.find((s) => s.codec_type === 'video')
        const W = vStream?.width ?? 1920
        const H = vStream?.height ?? 1080

        let filterComplex: string
        if (introHasAudio) {
          filterComplex = [
            `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=out:st=${fadeSt}:d=0.5[v0]`,
            `[0:a]afade=t=out:st=${fadeSt}:d=0.5[a0]`,
            `[1:v]fade=t=in:st=0:d=0.5[v1]`,
            `[1:a]afade=t=in:st=0:d=0.5[a1]`,
            `[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]`,
          ].join(';')
        } else {
          filterComplex = [
            `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=out:st=${fadeSt}:d=0.5[v0]`,
            `aevalsrc=0:c=stereo:s=44100:d=${introDur.toFixed(3)}[a0]`,
            `[1:v]fade=t=in:st=0:d=0.5[v1]`,
            `[1:a]afade=t=in:st=0:d=0.5[a1]`,
            `[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]`,
          ].join(';')
        }

        ffmpeg()
          .input(introPath)
          .input(mainPath)
          .outputOptions([
            '-filter_complex', filterComplex,
            '-map', '[vout]',
            '-map', '[aout]',
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '22',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
          ])
          .output(outputPath)
          .on('progress', (p) => sendProgress(win, { stage: 'intro', percent: p.percent ?? 0 }))
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .run()
      })
    })
  })
})

ipcMain.handle('ffmpeg:createVideoFromAudio', (
  _event,
  audioPath: string,
  imagePath: string | null,
  outputPath: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const win = getMainWindow()
    const cmd = ffmpeg()

    if (imagePath && fs.existsSync(imagePath)) {
      cmd.input(imagePath).inputOptions(['-loop', '1'])
    } else {
      cmd.input('color=black:s=1920x1080:r=25').inputOptions(['-f', 'lavfi'])
    }

    cmd.input(audioPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
        '-preset', 'ultrafast',
        '-crf', '35',
        '-c:a', 'copy',
        '-shortest',
        '-pix_fmt', 'yuv420p',
      ])
      .output(outputPath)
      .on('progress', (p) => sendProgress(win, { stage: 'slideshow', percent: p.percent ?? 0 }))
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
})

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
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
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

ipcMain.handle('ffmpeg:exportSegment', (
  _event,
  videoPath: string,
  srtPath: string,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
  opts: {
    fontSize?: number
    position?: 'bottom' | 'center' | 'top'
    background?: 'none' | 'semi' | 'solid'
    logoPath?: string
    logoPosition?: string
    logoSize?: string
    logoOpacity?: number
  }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const win = getMainWindow()
    const fontSize = opts.fontSize ?? 22
    const alignment = opts.position === 'top' ? 8 : opts.position === 'center' ? 5 : 2
    const marginV = opts.position === 'center' ? 0 : 40
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
          '-preset medium', '-crf 20', '-pix_fmt yuv420p',
        ])
        .videoCodec('libx264').audioCodec('aac')
    } else {
      cmd.videoFilters(subtitleFilter)
        .videoCodec('libx264').audioCodec('aac')
        .outputOptions(['-preset medium', '-crf 20', '-pix_fmt yuv420p'])
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
