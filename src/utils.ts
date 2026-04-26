import type { ReviewIssue } from './types'

const SCRUTINIZE_BATCH = 100

export async function runScrutinize(
  cues: { id: string; arabic: string; english: string }[],
  onProgress?: (current: number, total: number) => void
): Promise<ReviewIssue[]> {
  const idMap = cues.map((c) => c.id)
  const totalBatches = Math.ceil(cues.length / SCRUTINIZE_BATCH)
  const allIssues: ReviewIssue[] = []

  for (let b = 0; b < totalBatches; b++) {
    const offset = b * SCRUTINIZE_BATCH
    const batch = cues.slice(offset, offset + SCRUTINIZE_BATCH)
    // Use global numeric indices so cue_id maps back correctly across batches
    const payload = batch.map((c, j) => ({ id: String(offset + j), arabic: c.arabic, english: c.english }))
    const result = await window.api.gemini.scrutinize(payload)
    if (result.error) throw new Error(result.error)
    for (const raw of result.issues ?? []) {
      allIssues.push({
        id: `issue-${offset}-${raw.cue_id}-${Date.now()}`,
        cueId: idMap[parseInt(raw.cue_id)] ?? raw.cue_id,
        type: raw.type,
        problem: raw.problem,
        suggestedArabic: raw.suggested_arabic || undefined,
        suggestedEnglish: raw.suggested_english || undefined,
        confidence: raw.confidence,
        status: 'pending' as const,
      })
    }
    onProgress?.(b + 1, totalBatches)
  }

  return allIssues
}

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
