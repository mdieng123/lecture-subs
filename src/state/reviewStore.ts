import { create } from 'zustand'
import type { ReviewIssue } from '../types'

interface ReviewState {
  issues: ReviewIssue[]
  status: 'idle' | 'analyzing' | 'done' | 'error'
  error: string | null
  open: boolean
  sessionId: number
}

interface ReviewActions {
  setIssues: (issues: ReviewIssue[]) => void
  setStatus: (s: ReviewState['status']) => void
  setError: (e: string | null) => void
  setOpen: (v: boolean) => void
  startSession: () => number
  approveIssue: (id: string) => void
  dismissIssue: (id: string) => void
  approveAllByType: (type: ReviewIssue['type']) => void
  reset: () => void
}

export const useReviewStore = create<ReviewState & ReviewActions>((set) => ({
  issues: [],
  status: 'idle',
  error: null,
  open: false,
  sessionId: 0,

  setIssues: (issues) => set({ issues }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setOpen: (open) => set({ open }),

  startSession: () => {
    const id = Date.now()
    set({ sessionId: id, issues: [], status: 'idle', error: null })
    return id
  },

  approveIssue: (id) =>
    set((s) => ({ issues: s.issues.map((i) => i.id === id ? { ...i, status: 'approved' } : i) })),

  dismissIssue: (id) =>
    set((s) => ({ issues: s.issues.map((i) => i.id === id ? { ...i, status: 'dismissed' } : i) })),

  approveAllByType: (type) =>
    set((s) => ({
      issues: s.issues.map((i) =>
        i.type === type && i.status === 'pending' ? { ...i, status: 'approved' } : i
      ),
    })),

  reset: () => set({ issues: [], status: 'idle', error: null, open: false, sessionId: 0 }),
}))
