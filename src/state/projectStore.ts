import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Cue, Project, Settings, SubtitleStyle, LogoSettings, AppScreen, ProcessingProgress } from '../types'

const MAX_HISTORY = 50

interface ProjectStore {
  screen: AppScreen
  project: Project | null
  settings: Settings
  subtitleStyle: SubtitleStyle
  processing: ProcessingProgress | null
  hasApiKey: boolean
  hasGroqKey: boolean
  logoSettings: LogoSettings
  groqQuotaExhaustedAt: number | null

  setScreen: (screen: AppScreen) => void
  setProject: (project: Project) => void
  setProjectFilePath: (path: string) => void
  clearProject: () => void
  setProcessing: (p: ProcessingProgress | null | ((prev: ProcessingProgress | null) => ProcessingProgress | null)) => void
  setHasApiKey: (v: boolean) => void
  setHasGroqKey: (v: boolean) => void
  setLogoSettings: (s: Partial<LogoSettings>) => void
  setGroqQuotaExhaustedAt: (v: number | null) => void
  setSettings: (s: Partial<Settings>) => void
  setSubtitleStyle: (s: Partial<SubtitleStyle>) => void

  // Cue mutations (all go through history)
  updateCue: (id: string, patch: Partial<Omit<Cue, 'id'>>) => void
  splitCue: (id: string, atSeconds: number) => void
  mergeWithNext: (id: string) => void
  deleteCue: (id: string) => void
  setCues: (cues: Cue[]) => void

  undo: () => void
  redo: () => void
}

function pushHistory(project: Project, newCues: Cue[]): Project {
  const history = [...project.history, project.cues].slice(-MAX_HISTORY)
  return { ...project, cues: newCues, history, future: [] }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  screen: 'import',
  project: null,
  settings: {
    model: 'gemini-2.5-pro',
    chunkMinutes: 15,
    maxConcurrentChunks: 3,
    showCostEstimate: true,
  },
  subtitleStyle: {
    fontSize: 'medium',
    position: 'bottom',
    background: 'semi',
    includeArabic: false,
  },
  processing: null,
  hasApiKey: false,
  hasGroqKey: false,
  logoSettings: { path: null, position: 'top-right', size: 'medium', opacity: 100, enabled: false },
  groqQuotaExhaustedAt: null,

  setScreen: (screen) => set({ screen }),
  setProject: (project) => set({ project, screen: 'editor' }),
  setProjectFilePath: (path) => set((s) => s.project ? { project: { ...s.project, projectFilePath: path } } : {}),
  clearProject: () => set({ project: null, screen: 'import', processing: null }),
  setProcessing: (p) => set((state) => ({
    processing: typeof p === 'function' ? p(state.processing) : p,
  })),
  setHasApiKey: (hasApiKey) => set({ hasApiKey }),
  setHasGroqKey: (hasGroqKey) => set({ hasGroqKey }),
  setGroqQuotaExhaustedAt: (v) => set({ groqQuotaExhaustedAt: v }),
  setLogoSettings: (s) => set((state) => ({ logoSettings: { ...state.logoSettings, ...s } })),
  setSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
  setSubtitleStyle: (s) => set((state) => ({ subtitleStyle: { ...state.subtitleStyle, ...s } })),

  updateCue: (id, patch) => {
    const { project } = get()
    if (!project) return
    const newCues = project.cues.map((c) =>
      c.id === id ? { ...c, ...patch, edited: true } : c
    )
    set({ project: pushHistory(project, newCues) })
  },

  splitCue: (id, atSeconds) => {
    const { project } = get()
    if (!project) return
    const idx = project.cues.findIndex((c) => c.id === id)
    if (idx === -1) return
    const cue = project.cues[idx]
    if (atSeconds <= cue.startSeconds || atSeconds >= cue.endSeconds) return

    const first: Cue = { ...cue, endSeconds: atSeconds, edited: true }
    const second: Cue = {
      id: uuidv4(),
      startSeconds: atSeconds,
      endSeconds: cue.endSeconds,
      arabic: '',
      english: '',
      edited: true,
    }
    const newCues = [
      ...project.cues.slice(0, idx),
      first,
      second,
      ...project.cues.slice(idx + 1),
    ]
    set({ project: pushHistory(project, newCues) })
  },

  mergeWithNext: (id) => {
    const { project } = get()
    if (!project) return
    const idx = project.cues.findIndex((c) => c.id === id)
    if (idx === -1 || idx >= project.cues.length - 1) return
    const a = project.cues[idx]
    const b = project.cues[idx + 1]
    const merged: Cue = {
      ...a,
      endSeconds: b.endSeconds,
      arabic: [a.arabic, b.arabic].filter(Boolean).join(' '),
      english: [a.english, b.english].filter(Boolean).join(' '),
      edited: true,
    }
    const newCues = [
      ...project.cues.slice(0, idx),
      merged,
      ...project.cues.slice(idx + 2),
    ]
    set({ project: pushHistory(project, newCues) })
  },

  deleteCue: (id) => {
    const { project } = get()
    if (!project) return
    const newCues = project.cues.filter((c) => c.id !== id)
    set({ project: pushHistory(project, newCues) })
  },

  setCues: (cues) => {
    const { project } = get()
    if (!project) return
    set({ project: pushHistory(project, cues) })
  },

  undo: () => {
    const { project } = get()
    if (!project || project.history.length === 0) return
    const prev = project.history[project.history.length - 1]
    const future = [project.cues, ...project.future]
    set({
      project: {
        ...project,
        cues: prev,
        history: project.history.slice(0, -1),
        future,
      },
    })
  },

  redo: () => {
    const { project } = get()
    if (!project || project.future.length === 0) return
    const next = project.future[0]
    set({
      project: {
        ...project,
        cues: next,
        history: [...project.history, project.cues],
        future: project.future.slice(1),
      },
    })
  },
}))
