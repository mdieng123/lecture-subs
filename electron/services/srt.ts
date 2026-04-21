interface SrtCue {
  index: number
  startSeconds: number
  endSeconds: number
  text: string
}

function secondsToSrtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function srtTimeToSeconds(t: string): number {
  const [time, ms] = t.split(',')
  const [h, m, s] = time.split(':').map(Number)
  return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000
}

export function serializeSrt(cues: { startSeconds: number; endSeconds: number; english: string }[]): string {
  return cues
    .map((c, i) => {
      const text = c.english.trim()
      return `${i + 1}\n${secondsToSrtTime(c.startSeconds)} --> ${secondsToSrtTime(c.endSeconds)}\n${text}\n`
    })
    .join('\n')
}

export function parseSrt(srtText: string): SrtCue[] {
  const blocks = srtText.trim().split(/\n\n+/)
  const cues: SrtCue[] = []
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue
    const index = parseInt(lines[0], 10)
    const timeLine = lines[1]
    const [startStr, endStr] = timeLine.split(' --> ')
    const text = lines.slice(2).join('\n')
    cues.push({
      index,
      startSeconds: srtTimeToSeconds(startStr.trim()),
      endSeconds: srtTimeToSeconds(endStr.trim()),
      text,
    })
  }
  return cues
}
