import type { ReviewIssue } from './types'
import { shapeArabic } from './arabicShape'

const SCRUTINIZE_BATCH = 100

export async function runScrutinize(
  cues: { id: string; arabic: string; english: string }[],
  onProgress?: (current: number, total: number) => void,
  priorIssues?: ReviewIssue[]
): Promise<ReviewIssue[]> {
  const idMap = cues.map((c) => c.id)
  const totalBatches = Math.ceil(cues.length / SCRUTINIZE_BATCH)
  const allIssues: ReviewIssue[] = []

  // Build prior context from dismissed/approved issues for Gemini
  const priorContext = priorIssues?.length ? {
    dismissed: priorIssues
      .filter(i => i.status === 'dismissed')
      .map(i => ({ cueId: i.cueId, type: i.type, problem: i.problem })),
    approved: priorIssues
      .filter(i => i.status === 'approved')
      .map(i => ({ cueId: i.cueId, type: i.type })),
  } : undefined

  for (let b = 0; b < totalBatches; b++) {
    const offset = b * SCRUTINIZE_BATCH
    const batch = cues.slice(offset, offset + SCRUTINIZE_BATCH)
    // Use global numeric indices so cue_id maps back correctly across batches
    const payload = batch.map((c, j) => ({ id: String(offset + j), arabic: c.arabic, english: c.english }))
    const result = await window.api.gemini.scrutinize(payload, priorContext)
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

export function toFileUrl(filePath: string): string {
  if (!filePath) return ''
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${encodeURI(normalized)}`
  return `file://${encodeURI(normalized)}`
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

function secondsToAssTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.round((s % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// Emit a full ASS file with PlayResY=1080 so FontSize values render as pixels
// at 1080p (libass scales linearly for other resolutions). This avoids the
// libass default PlayResY=288 that made FontSize=22 render as ~82px on 1080p
// when the subtitles filter was fed an SRT.
export function serializeAss(
  cues: { startSeconds: number; endSeconds: number; english: string; arabic?: string }[],
  opts: {
    fontSize?: 'small' | 'medium' | 'large' | 'xl' | 'xxl'
    position?: 'bottom' | 'center' | 'top'
    background?: 'none' | 'semi' | 'solid'
    includeArabic?: boolean
  } = {}
): string {
  const fontSizeMap = { small: 24, medium: 30, large: 42, xl: 60, xxl: 90 }
  const fontSize = fontSizeMap[opts.fontSize ?? 'medium']
  const alignment = opts.position === 'top' ? 8 : opts.position === 'center' ? 5 : 2
  const marginV = opts.position === 'center' ? 0 : 60
  const outline = Math.max(2, Math.round((fontSize / 12) * 10) / 10)
  let borderStyle = 1
  let backColour = '&H00000000'
  if (opts.background === 'semi') { borderStyle = 4; backColour = '&H80000000' }
  else if (opts.background === 'solid') { borderStyle = 4; backColour = '&HCC000000' }

  // Tahoma has full Arabic Presentation Forms (including lam-alif ligatures) on
  // macOS, Windows, and most Linux distros, so libass renders Arabic glyphs
  // instead of tofu boxes — and the Latin letterforms still match Arial closely.
  const styleLine = `Style: Default,Tahoma,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,${backColour},0,0,0,0,100,100,0,0,${borderStyle},${outline},1,${alignment},144,144,${marginV},1`

  const header = [
    '[Script Info]',
    'Title: LectureSubs',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'PlayResX: 1920',
    'PlayResY: 1080',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n')

  const sanitize = (s: string) => s.replace(/\r/g, '').replace(/\n/g, '\\N').replace(/[{}]/g, '')

  const events = cues.map((c) => {
    let text = sanitize(c.english.trim())
    if (opts.includeArabic && c.arabic) {
      text = `${sanitize(shapeArabic(c.arabic.trim()))}\\N${text}`
    }
    return `Dialogue: 0,${secondsToAssTime(c.startSeconds)},${secondsToAssTime(c.endSeconds)},Default,,0,0,0,,${text}`
  }).join('\n')

  return `${header}\n${events}\n`
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
