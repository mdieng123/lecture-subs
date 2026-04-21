export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function secondsToSrtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function srtTimeToSeconds(t: string): number {
  const [time, ms] = t.split(',')
  const [h, m, s] = time.split(':').map(Number)
  return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000
}

export function serializeSrt(cues: { startSeconds: number; endSeconds: number; english: string; arabic?: string }[], includeArabic = false): string {
  return cues
    .map((c, i) => {
      let text = c.english.trim()
      if (includeArabic && c.arabic) {
        text = `${c.arabic.trim()}\n${text}`
      }
      return `${i + 1}\n${secondsToSrtTime(c.startSeconds)} --> ${secondsToSrtTime(c.endSeconds)}\n${text}\n`
    })
    .join('\n')
}

export function parseSrt(srtText: string): { startSeconds: number; endSeconds: number; text: string }[] {
  const blocks = srtText.trim().split(/\n\n+/)
  return blocks.flatMap((block) => {
    const lines = block.trim().split('\n')
    if (lines.length < 3) return []
    const timeLine = lines[1]
    const [startStr, endStr] = timeLine.split(' --> ')
    return [{
      startSeconds: srtTimeToSeconds(startStr.trim()),
      endSeconds: srtTimeToSeconds(endStr.trim()),
      text: lines.slice(2).join('\n'),
    }]
  })
}
