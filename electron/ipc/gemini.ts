import { ipcMain, BrowserWindow, app, safeStorage } from 'electron'
import { GoogleGenAI } from '@google/genai'
import Store from 'electron-store'
import fs from 'fs'
import { scrubError } from './store'

let cancelRequested = false
let groqQuotaExhausted = false

// Serialize all Groq audio calls — concurrent chunks hitting the API simultaneously
// causes cascading rate limit failures. One at a time avoids this entirely.
let groqQueue: Promise<void> = Promise.resolve()
function enqueueGroq<T>(fn: () => Promise<T>): Promise<T> {
  const result = groqQueue.then(() => {
    if (groqQuotaExhausted) throw new Error('QUOTA_ALREADY_EXHAUSTED')
    return fn()
  })
  groqQueue = result.then(() => {}, () => {})
  return result
}

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function sendProgress(win: BrowserWindow | null, data: unknown) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('gemini:chunkProgress', data)
  }
}

async function getApiKey(): Promise<string | null> {
  const store = new Store()
  const stored = store.get('encryptedApiKey') as string | undefined
  if (stored) {
    try {
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(stored, 'base64'))
        : Buffer.from(stored, 'base64').toString('utf-8')
    } catch { return null }
  }
  if (!app.isPackaged && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  return null
}

async function getGroqApiKey(): Promise<string | null> {
  const store = new Store()
  const stored = store.get('encryptedGroqApiKey') as string | undefined
  if (stored) {
    try {
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(stored, 'base64'))
        : Buffer.from(stored, 'base64').toString('utf-8')
    } catch { return null }
  }
  if (!app.isPackaged && process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY
  return null
}

const SALAFI_TRANSLATION_RULES = `TRANSLATION RULES (Salafi scholarly standard — do not deviate):
- Use "Allah" — never "God"
- Preserve honorifics exactly as spoken: صلى الله عليه وسلم → "ﷺ" or "peace be upon him", رضي الله عنه → "may Allah be pleased with him", رحمه الله → "may Allah have mercy on him"
- Hadith chain terms: حدثنا → "narrated to us", أخبرنا → "informed us", عن → "from", قال → "he said" / "she said"
- Translate literally and precisely — do NOT paraphrase, summarize, or interpret. If the speaker says something a specific way, preserve that exact meaning.
- Do not soften, modernize, or reword Islamic concepts. Keep fiqh and aqeedah terminology (e.g. salah not "prayer service", wudu not "washing", sunnah not "tradition").
- Proper nouns: transliterate names as they are commonly known in English Islamic scholarship (e.g. 'A'ishah, Ibn 'Umar, Abu Hurayrah).
- If a word has no clean English equivalent, transliterate it and do not invent a substitute.
- Only use ellipsis (...) when a sentence is genuinely cut off mid-phrase at a hard break (e.g. the cue ends mid-clause with no natural pause). Do NOT add ... just because the speech continues — most cues end at a natural pause or clause boundary and need no ellipsis. Avoid leading ... unless the cue truly resumes mid-sentence with no context. When in doubt, omit the ellipsis.`


interface Segment {
  start_seconds: number
  end_seconds: number
  arabic: string
  english: string
}


interface GroqWord { word: string; start: number; end: number }

function groupWordsIntoCues(words: GroqWord[]): { start: number; end: number; arabic: string }[] {
  const cues: { start: number; end: number; arabic: string }[] = []
  let batch: GroqWord[] = []

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    batch.push(w)
    const dur = batch[batch.length - 1].end - batch[0].start
    const nextGap = i + 1 < words.length ? words[i + 1].start - w.end : 999

    // Flush when: duration > 5s, OR 10+ words, OR long pause (>0.4s) after >= 3 words
    const shouldFlush = dur >= 5 || batch.length >= 10 || (nextGap > 0.4 && batch.length >= 3)
    if (shouldFlush) {
      cues.push({ start: batch[0].start, end: batch[batch.length - 1].end, arabic: batch.map((x) => x.word).join(' ') })
      batch = []
    }
  }
  if (batch.length > 0) {
    cues.push({ start: batch[0].start, end: batch[batch.length - 1].end, arabic: batch.map((x) => x.word).join(' ') })
  }
  return cues
}

async function groqTranscribeAndTranslate(
  groqKey: string,
  geminiKey: string,
  audioPath: string,
  chunkIndex: number,
  totalChunks: number,
  offsetSeconds: number,
  model: string
): Promise<Segment[]> {
  const win = getMainWindow()
  sendProgress(win, { chunkIndex, totalChunks, status: 'transcribing' })

  // Step 1: Groq Whisper — word-level timestamps for accurate sync
  const fileData = fs.readFileSync(audioPath)
  const fileSizeMB = fileData.byteLength / (1024 * 1024)
  if (fileSizeMB > 24) {
    throw new Error(`Audio chunk is ${fileSizeMB.toFixed(0)} MB — Groq's limit is 25 MB. Reduce chunk size in Settings (15 min is safe).`)
  }
  const formData = new FormData()
  formData.append('file', new Blob([fileData], { type: 'audio/mpeg' }), 'audio.mp3')
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'ar')
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'word')

  const { groqRes, lastErrText } = await enqueueGroq(async () => {
    let groqRes!: Response
    let lastErrText = ''
    for (let attempt = 1; attempt <= 4; attempt++) {
      groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      })
      if (groqRes.ok) break
      if (groqRes.status === 400) break
      lastErrText = await groqRes.text().catch(() => groqRes.statusText)
      if (groqRes.status === 429) {
        const waitMatch = lastErrText.match(/try again in (?:(\d+)m)?([\d.]+)s/i)
        const waitMs = waitMatch
          ? ((parseInt(waitMatch[1] ?? '0') * 60) + parseFloat(waitMatch[2])) * 1000 + 2000
          : 15000
        const usedMatch = lastErrText.match(/Used\s+([\d.]+)/i)
        const limitMatch = lastErrText.match(/Limit\s+([\d.]+)/i)
        const requestedMatch = lastErrText.match(/Requested\s+([\d.]+)/i)
        const used = usedMatch ? Math.round(parseFloat(usedMatch[1])) : null
        const limit = limitMatch ? Math.round(parseFloat(limitMatch[1])) : null
        const requested = requestedMatch ? Math.round(parseFloat(requestedMatch[1])) : null
        const nearlyExhausted = used !== null && limit !== null && used / limit > 0.9
        sendProgress(win, {
          chunkIndex, totalChunks,
          status: nearlyExhausted ? 'quota_exhausted' : 'waiting',
          retryInMs: waitMs, used, limit, requested,
        })
        if (nearlyExhausted) {
          groqQuotaExhausted = true
          throw new Error(`QUOTA_EXHAUSTED:${used}:${limit}:${waitMs}`)
        }
        await new Promise((r) => setTimeout(r, waitMs))
      } else {
        await new Promise((r) => setTimeout(r, attempt * 2000))
      }
    }
    return { groqRes, lastErrText }
  })
  if (!groqRes.ok) {
    throw new Error(`Groq transcription failed: ${lastErrText || groqRes.statusText}`.replace(groqKey, '[REDACTED]'))
  }
  const groqData = await groqRes.json() as { words?: GroqWord[] }
  const words = (groqData.words ?? []).filter((w) => w.word.trim().length > 0)
  if (words.length === 0) return []

  // Group words into subtitle-sized cues (~3-5s each)
  const rawCues = groupWordsIntoCues(words)
  if (rawCues.length === 0) return []

  // Step 2: Gemini — batch translate Arabic cues to English (text only, no audio)
  const ai = new GoogleGenAI({ apiKey: geminiKey })
  const segInput = rawCues.map((c, i) => `${i}: ${c.arabic}`).join('\n')

  const translationResult = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [{ text: `You are translating Arabic Islamic lecture cues (likely a Salafi/Athari scholar on hadith or aqeedah) into English subtitles.

${SALAFI_TRANSLATION_RULES}

Each translation must fit on 1–2 subtitle lines (max ~42 chars per line). Be concise but never sacrifice precision.

Translate each numbered Arabic cue. Return a JSON array of strings — same count, same order.

Arabic cues:
${segInput}` }],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'array' as const, items: { type: 'string' as const } },
    },
  })

  let translations: string[] = []
  try { translations = JSON.parse(translationResult.text ?? '[]') }
  catch { translations = rawCues.map(() => '') }

  const sanitized: Segment[] = rawCues.map((c, i) => ({
    start_seconds: c.start + offsetSeconds,
    end_seconds: Math.max(c.end + offsetSeconds, c.start + offsetSeconds + 0.5),
    arabic: c.arabic,
    english: translations[i] ?? '',
  }))

  sendProgress(win, { chunkIndex, totalChunks, status: 'done', segmentCount: sanitized.length })
  return sanitized
}

const CLIPS_SCHEMA = {
  type: 'object' as const,
  properties: {
    clips: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          start_seconds: { type: 'number' as const },
          end_seconds: { type: 'number' as const },
          title: { type: 'string' as const },
          reason: { type: 'string' as const },
        },
        required: ['start_seconds', 'end_seconds', 'title', 'reason'],
      },
    },
  },
  required: ['clips'],
}

ipcMain.handle('gemini:detectClips', async (_event, transcript: string) => {
  const apiKey = await getApiKey()
  if (!apiKey) return { error: 'No API key configured' }

  const store = new Store()
  const model = (store.get('model') as string) ?? 'gemini-2.5-pro'
  const ai = new GoogleGenAI({ apiKey })

  const prompt = `You are a social media content editor for an Islamic lecture channel. Below is the transcript with timestamps (format: [M:SS-M:SS] "English text").

Identify 3-8 clips that would perform well as Instagram Reels, TikTok, or YouTube Shorts.

STRICT RULES:
- Duration: 20–90 seconds
- The clip MUST be fully self-contained — a viewer with zero context must immediately understand what is being said. Do NOT start a clip mid-story, mid-sentence, or at a point that references something just said ("He said...", "So as we mentioned...", "in his house?" etc.).
- Start point: must be the natural beginning of a thought, story, or statement — preferably where the speaker introduces a new topic, a hadith, or a direct teaching.
- End point: must be after a complete conclusion, punchline, or clear stopping point — not mid-sentence or mid-list.
- Engaging: memorable quote, clear lesson, compelling hadith, or surprising moment that stands alone.
- Prefer clips where the opening line immediately hooks the viewer.

Transcript:
${transcript}

Return JSON with a clips array.`

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', responseSchema: CLIPS_SCHEMA },
    })
    const parsed = JSON.parse(result.text ?? '{}')
    return { clips: parsed.clips ?? [] }
  } catch (err) {
    return { error: scrubError(err).message }
  }
})

const SEGMENTS_SCHEMA = {
  type: 'object' as const,
  properties: {
    segments: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          start_seconds: { type: 'number' as const },
          end_seconds: { type: 'number' as const },
          title: { type: 'string' as const },
          topic_summary: { type: 'string' as const },
        },
        required: ['start_seconds', 'end_seconds', 'title', 'topic_summary'],
      },
    },
  },
  required: ['segments'],
}

ipcMain.handle('gemini:detectSegments', async (_event, transcript: string, durationRange: string) => {
  const apiKey = await getApiKey()
  if (!apiKey) return { error: 'No API key configured' }

  const store = new Store()
  const model = (store.get('model') as string) ?? 'gemini-2.5-pro'
  const ai = new GoogleGenAI({ apiKey })

  const rangeMap: Record<string, { minSec: number; maxSec: number; label: string }> = {
    '4-6':   { minSec: 240,  maxSec: 360,  label: '4–6 minutes' },
    '7-10':  { minSec: 420,  maxSec: 600,  label: '7–10 minutes' },
    '11-15': { minSec: 660,  maxSec: 900,  label: '11–15 minutes' },
    '15-20': { minSec: 900,  maxSec: 1200, label: '15–20 minutes' },
  }
  const range = rangeMap[durationRange] ?? rangeMap['7-10']

  const prompt = `You are a YouTube content editor for an Islamic lecture channel. Below is the full lecture transcript with timestamps (format: [M:SS-M:SS] "English text").

Split this lecture into YouTube videos of ${range.label} each (${range.minSec}–${range.maxSec} seconds per segment).

STRICT RULES:
- Cover the ENTIRE lecture from start to finish — no gaps, no omitted content.
- Segments must not overlap — each second belongs to exactly one segment.
- Each segment duration MUST be between ${range.minSec} and ${range.maxSec} seconds. Do not go under or over.
- Every segment must cover a COMPLETE sub-topic. Never split mid-argument, mid-story, or mid-hadith.
- Start point: begin at a natural topic boundary — where the speaker starts a new point, hadith, or idea.
- End point: end after the speaker fully concludes a thought — not mid-sentence, not mid-list.
- Titles must be specific, YouTube-friendly, and describe what is actually taught. Avoid vague titles like "Part 1" or "Lecture Segment". Aim for something a viewer would search for.
- topic_summary: 1–2 sentences describing exactly what is covered.

Transcript:
${transcript}

Return JSON with a segments array covering the full video.`

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', responseSchema: SEGMENTS_SCHEMA },
    })
    const parsed = JSON.parse(result.text ?? '{}')
    return { segments: parsed.segments ?? [] }
  } catch (err) {
    return { error: scrubError(err).message }
  }
})

const SCRUTINIZE_SCHEMA = {
  type: 'object' as const,
  properties: {
    issues: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          cue_id: { type: 'string' as const },
          type: { type: 'string' as const, enum: ['transcription', 'translation', 'islamic_phrase', 'grammar'] },
          problem: { type: 'string' as const },
          suggested_arabic: { type: 'string' as const },
          suggested_english: { type: 'string' as const },
          confidence: { type: 'string' as const, enum: ['high', 'medium', 'low'] },
        },
        required: ['cue_id', 'type', 'problem', 'confidence'],
      },
    },
  },
  required: ['issues'],
}

ipcMain.handle('gemini:scrutinize', async (_event, cues: { id: string; arabic: string; english: string }[]) => {
  const apiKey = await getApiKey()
  if (!apiKey) return { error: 'No API key configured' }

  const store = new Store()
  const model = (store.get('model') as string) ?? 'gemini-2.5-flash'
  const ai = new GoogleGenAI({ apiKey })

  const cueLines = cues
    .map((c) => `{"id":"${c.id}","arabic":${JSON.stringify(c.arabic)},"english":${JSON.stringify(c.english)}}`)
    .join('\n')

  const prompt = `You are an expert Arabic Islamic lecture reviewer. Examine these subtitle cues from a lecture and flag genuine errors only.

Flag a cue if it has:
1. "transcription" — garbled or phonetically wrong Arabic (Whisper speech-to-text hallucinations, non-words, clearly wrong words). Provide corrected Arabic in suggested_arabic.
2. "translation" — the English meaning clearly does not match the Arabic text. Provide corrected English in suggested_english.
3. "islamic_phrase" — an Islamic term, honorific, Quranic phrase, or du'a that was misheard or mistranscribed (e.g. sallallahu alayhi wa sallam, radiallahu anhu, Quranic ayahs). Provide corrected Arabic and/or English.
4. "grammar" — correct Arabic words but with wrong grammatical form: wrong verb conjugation, incorrect gender/number agreement, wrong case ending, or a word that is grammatically inconsistent with the surrounding cues. Provide corrected Arabic in suggested_arabic.

Rules:
- ONLY flag actual errors — do not flag stylistic choices, synonyms, or missing diacritics
- If Arabic is empty string, skip transcription check for that cue
- Confidence "high" = obvious error, "medium" = likely error, "low" = possible error
- Only include suggested_arabic/suggested_english when you are confident in the correction
- CONTEXT: Always read the cues immediately before and after the suspect cue before deciding. A word that looks wrong in isolation may be correct given the surrounding speech, and a sentence fragment that seems fine alone may reveal a transcription error when read in sequence. Use the full transcript flow to inform every correction.

Cues (JSON, one per line):
${cueLines}

Return JSON with an "issues" array. Return empty array if no issues found.`

  try {
    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json', responseSchema: SCRUTINIZE_SCHEMA },
    })
    const parsed = JSON.parse(result.text ?? '{}')
    return { issues: parsed.issues ?? [] }
  } catch (err) {
    return { error: scrubError(err).message }
  }
})

ipcMain.handle('gemini:cancelProcessing', () => {
  cancelRequested = true
  return { ok: true }
})

ipcMain.handle(
  'gemini:transcribeChunk',
  async (_event, audioPath: string, chunkIndex: number, totalChunks: number, offsetSeconds: number) => {
    cancelRequested = false
    groqQuotaExhausted = false
    const apiKey = await getApiKey()
    if (!apiKey) return { error: 'No Gemini API key configured' }

    const store = new Store()
    const model = (store.get('model') as string) ?? 'gemini-2.5-pro'

    try {
      const groqKey = await getGroqApiKey()
      if (!groqKey) return { error: 'Groq API key required. Add it in Settings.' }
      const segments = await groqTranscribeAndTranslate(
        groqKey, apiKey, audioPath, chunkIndex, totalChunks, offsetSeconds, model
      )
      return { segments }
    } catch (err) {
      return { error: scrubError(err).message }
    }
  }
)
