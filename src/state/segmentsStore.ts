import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { VideoSegment, Cue } from '../types'

interface SegmentsStore {
  segments: VideoSegment[]
  detecting: boolean
  error: string | null
  isDirty: boolean
  savedFilePath: string | null
  returnScreen: 'editor' | 'import'
  isManualPreview: boolean

  setSegments: (segments: VideoSegment[]) => void
  setDetecting: (v: boolean) => void
  setError: (e: string | null) => void
  markSaved: (filePath: string) => void
  markDirty: () => void
  setReturnScreen: (s: 'editor' | 'import') => void
  setIsManualPreview: (v: boolean) => void
  toggleSegment: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  updateSegmentCue: (segId: string, cueId: string, patch: Partial<Omit<Cue, 'id'>>) => void
  mergeSegmentCues: (segId: string, cueId: string) => void
  deleteSegmentCue: (segId: string, cueId: string) => void
  extendSegment: (segId: string, direction: 'start' | 'end', allCues: Cue[]) => void
  trimSegment: (segId: string, direction: 'start' | 'end') => void
  reset: () => void
}

export const useSegmentsStore = create<SegmentsStore>((set, get) => ({
  segments: [],
  detecting: false,
  error: null,
  isDirty: false,
  savedFilePath: null,
  returnScreen: 'editor',
  isManualPreview: false,

  setSegments: (segments) => set({ segments, isDirty: true }),
  setDetecting: (v) => set({ detecting: v }),
  setError: (e) => set({ error: e }),
  markSaved: (filePath) => set({ isDirty: false, savedFilePath: filePath }),
  markDirty: () => set({ isDirty: true }),
  setReturnScreen: (s) => set({ returnScreen: s }),
  setIsManualPreview: (v) => set({ isManualPreview: v }),

  toggleSegment: (id) => set((s) => ({
    isDirty: true,
    segments: s.segments.map((seg) => seg.id === id ? { ...seg, selected: !seg.selected } : seg),
  })),

  selectAll: () => set((s) => ({ isDirty: true, segments: s.segments.map((seg) => ({ ...seg, selected: true })) })),
  deselectAll: () => set((s) => ({ isDirty: true, segments: s.segments.map((seg) => ({ ...seg, selected: false })) })),

  updateSegmentCue: (segId, cueId, patch) => set((s) => ({
    isDirty: true,
    segments: s.segments.map((seg) =>
      seg.id !== segId ? seg : {
        ...seg,
        cues: seg.cues.map((c) => c.id === cueId ? { ...c, ...patch, edited: true } : c),
      }
    ),
  })),

  mergeSegmentCues: (segId, cueId) => {
    const { segments } = get()
    const seg = segments.find((s) => s.id === segId)
    if (!seg) return
    const idx = seg.cues.findIndex((c) => c.id === cueId)
    if (idx === -1 || idx >= seg.cues.length - 1) return
    const a = seg.cues[idx]
    const b = seg.cues[idx + 1]
    const merged: Cue = {
      ...a,
      endSeconds: b.endSeconds,
      arabic: [a.arabic, b.arabic].filter(Boolean).join(' '),
      english: [a.english, b.english].filter(Boolean).join(' '),
      edited: true,
    }
    set((s) => ({
      isDirty: true,
      segments: s.segments.map((seg) =>
        seg.id !== segId ? seg : {
          ...seg,
          cues: [...seg.cues.slice(0, idx), merged, ...seg.cues.slice(idx + 2)],
        }
      ),
    }))
  },

  deleteSegmentCue: (segId, cueId) => set((s) => ({
    isDirty: true,
    segments: s.segments.map((seg) =>
      seg.id !== segId ? seg : { ...seg, cues: seg.cues.filter((c) => c.id !== cueId) }
    ),
  })),

  extendSegment: (segId, direction, allCues) => {
    const { segments } = get()
    const seg = segments.find((s) => s.id === segId)
    if (!seg) return

    if (direction === 'end') {
      const next = allCues.find((c) => c.startSeconds >= seg.endSeconds - 0.1)
      if (!next) return
      const newEnd = next.endSeconds
      const dur = newEnd - seg.startSeconds
      const added: Cue = {
        ...next,
        id: uuidv4(),
        startSeconds: +Math.max(0, next.startSeconds - seg.startSeconds).toFixed(3),
        endSeconds: +Math.min(dur, next.endSeconds - seg.startSeconds).toFixed(3),
      }
      set((s) => ({
        isDirty: true,
        segments: s.segments.map((seg) => seg.id !== segId ? seg : {
          ...seg, endSeconds: newEnd, cues: [...seg.cues, added],
        }),
      }))
    } else {
      const prev = [...allCues].reverse().find((c) => c.endSeconds <= seg.startSeconds + 0.1)
      if (!prev) return
      const newStart = prev.startSeconds
      const shift = seg.startSeconds - newStart
      const added: Cue = { ...prev, id: uuidv4(), startSeconds: 0, endSeconds: +shift.toFixed(3) }
      set((s) => ({
        isDirty: true,
        segments: s.segments.map((seg) => seg.id !== segId ? seg : {
          ...seg,
          startSeconds: newStart,
          cues: [added, ...seg.cues.map((c) => ({
            ...c,
            startSeconds: +(c.startSeconds + shift).toFixed(3),
            endSeconds: +(c.endSeconds + shift).toFixed(3),
          }))],
        }),
      }))
    }
  },

  trimSegment: (segId, direction) => {
    const { segments } = get()
    const seg = segments.find((s) => s.id === segId)
    if (!seg || seg.cues.length <= 1) return

    if (direction === 'end') {
      const last = seg.cues[seg.cues.length - 1]
      set((s) => ({
        isDirty: true,
        segments: s.segments.map((seg) => seg.id !== segId ? seg : {
          ...seg, endSeconds: seg.startSeconds + last.startSeconds, cues: seg.cues.slice(0, -1),
        }),
      }))
    } else {
      const first = seg.cues[0]
      const shift = first.endSeconds
      set((s) => ({
        isDirty: true,
        segments: s.segments.map((seg) => seg.id !== segId ? seg : {
          ...seg,
          startSeconds: seg.startSeconds + first.endSeconds,
          cues: seg.cues.slice(1).map((c) => ({
            ...c,
            startSeconds: +(c.startSeconds - shift).toFixed(3),
            endSeconds: +(c.endSeconds - shift).toFixed(3),
          })),
        }),
      }))
    }
  },

  reset: () => set({ segments: [], detecting: false, error: null, isDirty: false, savedFilePath: null, returnScreen: 'editor', isManualPreview: false }),
}))

export function buildSegmentsFromSuggestions(
  allCues: Cue[],
  suggestions: { start_seconds: number; end_seconds: number; title: string; topic_summary: string }[]
): VideoSegment[] {
  return suggestions.map((s) => {
    const start = s.start_seconds
    const end = s.end_seconds
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
    return {
      id: uuidv4(),
      title: s.title,
      topicSummary: s.topic_summary,
      startSeconds: start,
      endSeconds: end,
      cues,
      selected: true,
    }
  })
}
