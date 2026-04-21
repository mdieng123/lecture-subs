import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Clip, Cue } from '../types'

const MAX_CUE_DURATION = 7 // seconds — split anything longer

function splitLongCue(cue: Cue): Cue[] {
  const dur = cue.endSeconds - cue.startSeconds
  if (dur <= MAX_CUE_DURATION) return [cue]
  const numChunks = Math.ceil(dur / MAX_CUE_DURATION)
  const chunkDur = dur / numChunks
  const words = cue.english.trim().split(/\s+/)
  return Array.from({ length: numChunks }, (_, i) => {
    const wStart = Math.floor(i * words.length / numChunks)
    const wEnd = Math.floor((i + 1) * words.length / numChunks)
    return {
      ...cue,
      id: uuidv4(),
      startSeconds: +(cue.startSeconds + i * chunkDur).toFixed(3),
      endSeconds: +(cue.startSeconds + (i + 1) * chunkDur).toFixed(3),
      english: words.slice(wStart, wEnd).join(' '),
      arabic: i === 0 ? cue.arabic : '',
    }
  })
}

interface ClipsStore {
  clips: Clip[]
  detecting: boolean
  error: string | null
  isDirty: boolean
  savedFilePath: string | null
  returnScreen: 'editor' | 'import'

  setClips: (clips: Clip[]) => void
  setDetecting: (v: boolean) => void
  setError: (e: string | null) => void
  markSaved: (filePath: string) => void
  setReturnScreen: (s: 'editor' | 'import') => void
  toggleClip: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  updateClipCue: (clipId: string, cueId: string, patch: Partial<Omit<Cue, 'id'>>) => void
  mergeClipCues: (clipId: string, cueId: string) => void
  deleteClipCue: (clipId: string, cueId: string) => void
  extendClip: (clipId: string, direction: 'start' | 'end', allCues: Cue[]) => void
  trimClip: (clipId: string, direction: 'start' | 'end') => void
  reset: () => void
}

export const useClipsStore = create<ClipsStore>((set, get) => ({
  clips: [],
  detecting: false,
  error: null,
  isDirty: false,
  savedFilePath: null,
  returnScreen: 'editor',

  setClips: (clips) => set({ clips, isDirty: true }),
  setDetecting: (v) => set({ detecting: v }),
  setError: (e) => set({ error: e }),
  markSaved: (filePath) => set({ isDirty: false, savedFilePath: filePath }),
  setReturnScreen: (s) => set({ returnScreen: s }),

  toggleClip: (id) => set((s) => ({
    clips: s.clips.map((c) => c.id === id ? { ...c, selected: !c.selected } : c),
    isDirty: true,
  })),

  selectAll: () => set((s) => ({ clips: s.clips.map((c) => ({ ...c, selected: true })), isDirty: true })),
  deselectAll: () => set((s) => ({ clips: s.clips.map((c) => ({ ...c, selected: false })), isDirty: true })),

  updateClipCue: (clipId, cueId, patch) => set((s) => ({
    isDirty: true,
    clips: s.clips.map((c) =>
      c.id !== clipId ? c : {
        ...c,
        cues: c.cues.map((cue) => cue.id === cueId ? { ...cue, ...patch, edited: true } : cue),
      }
    ),
  })),

  mergeClipCues: (clipId, cueId) => {
    const { clips } = get()
    const clip = clips.find((c) => c.id === clipId)
    if (!clip) return
    const idx = clip.cues.findIndex((c) => c.id === cueId)
    if (idx === -1 || idx >= clip.cues.length - 1) return
    const a = clip.cues[idx]
    const b = clip.cues[idx + 1]
    const merged: Cue = {
      ...a,
      endSeconds: b.endSeconds,
      arabic: [a.arabic, b.arabic].filter(Boolean).join(' '),
      english: [a.english, b.english].filter(Boolean).join(' '),
      edited: true,
    }
    set((s) => ({
      isDirty: true,
      clips: s.clips.map((c) =>
        c.id !== clipId ? c : {
          ...c,
          cues: [...c.cues.slice(0, idx), merged, ...c.cues.slice(idx + 2)],
        }
      ),
    }))
  },

  deleteClipCue: (clipId, cueId) => set((s) => ({
    isDirty: true,
    clips: s.clips.map((c) =>
      c.id !== clipId ? c : { ...c, cues: c.cues.filter((cue) => cue.id !== cueId) }
    ),
  })),

  extendClip: (clipId, direction, allCues) => {
    const { clips } = get()
    const clip = clips.find((c) => c.id === clipId)
    if (!clip) return

    if (direction === 'end') {
      // Find the first source cue that starts at or after clip.endSeconds
      const next = allCues.find((c) => c.startSeconds >= clip.endSeconds - 0.1 && c.startSeconds >= clip.endSeconds - 1)
        ?? allCues.find((c) => c.startSeconds >= clip.endSeconds - 0.5)
        ?? allCues.find((c) => c.startSeconds > clip.endSeconds - 2)
      if (!next) return
      const newEnd = next.endSeconds
      const dur = newEnd - clip.startSeconds
      const addedCues: Cue[] = [{
        ...next,
        id: uuidv4(),
        startSeconds: +Math.max(0, next.startSeconds - clip.startSeconds).toFixed(3),
        endSeconds: +Math.min(dur, next.endSeconds - clip.startSeconds).toFixed(3),
      }]
      set((s) => ({
        isDirty: true,
        clips: s.clips.map((c) => c.id !== clipId ? c : {
          ...c,
          endSeconds: newEnd,
          cues: [...c.cues, ...addedCues.flatMap(splitLongCue)],
        }),
      }))
    } else {
      // Prepend: find the source cue just before clip.startSeconds
      const prev = [...allCues].reverse().find((c) => c.endSeconds <= clip.startSeconds + 0.1)
      if (!prev) return
      const newStart = prev.startSeconds
      const shift = clip.startSeconds - newStart
      const addedCue: Cue = {
        ...prev,
        id: uuidv4(),
        startSeconds: 0,
        endSeconds: +shift.toFixed(3),
      }
      set((s) => ({
        isDirty: true,
        clips: s.clips.map((c) => c.id !== clipId ? c : {
          ...c,
          startSeconds: newStart,
          endSeconds: c.endSeconds,
          cues: [addedCue, ...c.cues.map((cu) => ({
            ...cu,
            startSeconds: +(cu.startSeconds + shift).toFixed(3),
            endSeconds: +(cu.endSeconds + shift).toFixed(3),
          }))].flatMap(splitLongCue),
        }),
      }))
    }
  },

  trimClip: (clipId, direction) => {
    const { clips } = get()
    const clip = clips.find((c) => c.id === clipId)
    if (!clip || clip.cues.length <= 1) return

    if (direction === 'end') {
      const last = clip.cues[clip.cues.length - 1]
      set((s) => ({
        isDirty: true,
        clips: s.clips.map((c) => c.id !== clipId ? c : {
          ...c,
          endSeconds: clip.startSeconds + last.startSeconds,
          cues: c.cues.slice(0, -1),
        }),
      }))
    } else {
      const first = clip.cues[0]
      const shift = first.endSeconds
      set((s) => ({
        isDirty: true,
        clips: s.clips.map((c) => c.id !== clipId ? c : {
          ...c,
          startSeconds: clip.startSeconds + first.endSeconds,
          cues: c.cues.slice(1).map((cu) => ({
            ...cu,
            startSeconds: +(cu.startSeconds - shift).toFixed(3),
            endSeconds: +(cu.endSeconds - shift).toFixed(3),
          })),
        }),
      }))
    }
  },

  reset: () => set({ clips: [], detecting: false, error: null, isDirty: false, savedFilePath: null, returnScreen: 'editor' }),
}))

export function buildClipsFromSuggestions(
  allCues: Cue[],
  suggestions: { start_seconds: number; end_seconds: number; title: string; reason: string }[]
): Clip[] {
  return suggestions.map((s) => {
    const start = s.start_seconds
    const end = s.end_seconds
    // Include any cue that overlaps the clip range, clamp to [0, duration], split long cues
    const dur = end - start
    const cues = allCues
      .filter((c) => c.startSeconds < end + 0.1 && c.endSeconds > start - 0.1)
      .map((c) => ({
        ...c,
        id: uuidv4(),
        startSeconds: +Math.max(0, c.startSeconds - start).toFixed(3),
        endSeconds: +Math.min(dur, c.endSeconds - start).toFixed(3),
      }))
      .filter((c) => c.endSeconds - c.startSeconds >= 0.5)
      .flatMap(splitLongCue)
    return {
      id: uuidv4(),
      title: s.title,
      reason: s.reason,
      startSeconds: start,
      endSeconds: end,
      cues,
      selected: true,
    }
  })
}
