import { useState, useEffect, useRef } from 'react'
import { useReviewStore } from '../state/reviewStore'
import type { ReviewIssue } from '../types'
import { toFileUrl } from '../utils'

type CueLookup = (id: string) => { startSeconds: number; endSeconds: number; arabic?: string; english: string } | undefined
type ContextLookup = (id: string) => { title: string; cueIndex: number; totalCues: number } | undefined

const TYPE_LABEL: Record<ReviewIssue['type'], string> = {
  transcription: 'Transcription',
  translation: 'Translation',
  islamic_phrase: 'Islamic Phrase',
  grammar: 'Grammar',
}
const TYPE_COLOR: Record<ReviewIssue['type'], string> = {
  transcription: 'text-orange-400 bg-orange-900/30 border-orange-800/50',
  translation: 'text-blue-400 bg-blue-900/30 border-blue-800/50',
  islamic_phrase: 'text-purple-400 bg-purple-900/30 border-purple-800/50',
  grammar: 'text-teal-400 bg-teal-900/30 border-teal-800/50',
}
const CONF_COLOR: Record<ReviewIssue['confidence'], string> = {
  high: 'text-green-400',
  medium: 'text-yellow-400',
  low: 'text-[hsl(215,15%,45%)]',
}

interface Props {
  videoPath: string
  getAbsoluteTime: (cueId: string) => number | undefined
  onClose: () => void
  onRerun: () => void
  getCue: CueLookup
  onApplyFix: (cueId: string, patch: { arabic?: string; english?: string }) => void
  getContext?: ContextLookup
  onMarkDirty?: () => void
}

type Filter = 'all' | ReviewIssue['type']


export default function ReviewPanel({ videoPath, getAbsoluteTime, onClose, onRerun, getCue, onApplyFix, getContext, onMarkDirty }: Props) {
  const { issues, status, error, batchProgress, approveIssue, dismissIssue, approveAllByType } = useReviewStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const rafRef = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const videoSrc = toFileUrl(videoPath)

  useEffect(() => {
    function tick() {
      if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  function seekTo(time: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      videoRef.current.play()
      setPlaying(true)
    }
  }

  const pending = issues.filter((i) => i.status === 'pending')
  const visible = issues.filter((i) => filter === 'all' || i.type === filter)
  const pendingVisible = visible.filter((i) => i.status === 'pending')

  function doApprove(issue: ReviewIssue) {
    approveIssue(issue.id)
    onMarkDirty?.()
    const patch: { arabic?: string; english?: string } = {}
    if (issue.suggestedArabic) patch.arabic = issue.suggestedArabic
    if (issue.suggestedEnglish) patch.english = issue.suggestedEnglish
    if (Object.keys(patch).length) onApplyFix(issue.cueId, patch)
  }

  function seekToCue(cueId: string) {
    const t = getAbsoluteTime(cueId)
    if (t !== undefined) seekTo(t)
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      const visiblePending = visible.filter((i) => i.status === 'pending')
      if (!visiblePending.length) return
      const issue = visiblePending[focusedIdx] ?? visiblePending[0]
      if (!issue) return
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); doApprove(issue); setFocusedIdx((i) => Math.min(i, visiblePending.length - 2)) }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); dismissIssue(issue.id); onMarkDirty?.(); setFocusedIdx((i) => Math.min(i, visiblePending.length - 2)) }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visiblePending.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [visible, focusedIdx, issues])

  const countByType = (t: ReviewIssue['type']) => issues.filter((i) => i.type === t && i.status === 'pending').length

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[hsl(222,20%,12%)] border border-[hsl(220,15%,22%)] rounded-2xl shadow-2xl flex flex-col w-[780px] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Embedded video */}
        <div className="flex-shrink-0 border-b border-[hsl(220,15%,20%)] bg-black relative" style={{ height: 140 }}>
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full"
            style={{ objectFit: 'contain' }}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onClick={() => {
              if (videoRef.current) {
                if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true) }
                else { videoRef.current.pause(); setPlaying(false) }
              }
            }}
          />
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white text-sm">▶</div>
            </div>
          )}
          <div className="absolute bottom-1.5 right-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none">
            {String(Math.floor(currentTime / 60)).padStart(2, '0')}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(220,15%,20%)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-base">Transcript Review</span>
            {status === 'done' && (
              <>
                <span className="text-xs text-[hsl(215,15%,45%)]">
                  {pending.length} pending · {issues.filter((i) => i.status === 'approved').length} approved · {issues.filter((i) => i.status === 'dismissed').length} dismissed
                </span>
                <button
                  onClick={onRerun}
                  className="text-[10px] text-[hsl(215,15%,40%)] hover:text-white underline"
                >
                  Re-run
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[hsl(215,15%,38%)] hidden sm:block">Y approve · N dismiss · ↑↓ navigate · Esc close</span>
            <button onClick={onClose} className="text-[hsl(215,15%,50%)] hover:text-white text-lg px-1">×</button>
          </div>
        </div>

        {status === 'analyzing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
            <div className="w-8 h-8 border-2 border-[hsl(210,80%,55%)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[hsl(215,15%,50%)]">
              {batchProgress
                ? `Reviewing batch ${batchProgress.current} of ${batchProgress.total}...`
                : 'Gemini is reviewing the transcript...'}
            </p>
            {batchProgress && (
              <div className="w-48 h-1.5 bg-[hsl(222,20%,20%)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[hsl(210,80%,55%)] rounded-full transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {status === 'done' && (
          <>
            {/* Filter tabs + batch actions */}
            <div className="flex items-center gap-1 px-5 py-2.5 border-b border-[hsl(220,15%,18%)] flex-shrink-0 flex-wrap gap-y-2">
              {(['all', 'transcription', 'translation', 'islamic_phrase', 'grammar'] as Filter[]).map((f) => {
                const count = f === 'all' ? pending.length : countByType(f as ReviewIssue['type'])
                return (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setFocusedIdx(0) }}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      filter === f
                        ? 'bg-[hsl(210,80%,55%)] border-[hsl(210,80%,55%)] text-white'
                        : 'border-[hsl(220,15%,25%)] text-[hsl(215,15%,55%)] hover:text-white hover:border-[hsl(220,15%,38%)]'
                    }`}
                  >
                    {f === 'all' ? 'All' : TYPE_LABEL[f as ReviewIssue['type']]}
                    {count > 0 && <span className="ml-1.5 opacity-70">({count})</span>}
                  </button>
                )
              })}
              {filter !== 'all' && countByType(filter as ReviewIssue['type']) > 0 && (
                <button
                  onClick={() => {
                    const type = filter as ReviewIssue['type']
                    const toApprove = issues.filter((i) => i.type === type && i.status === 'pending')
                    toApprove.forEach((i) => doApprove(i))
                    approveAllByType(type)
                    onMarkDirty?.()
                  }}
                  className="ml-auto text-xs px-3 py-1 rounded-full border border-green-700/60 text-green-400 hover:bg-green-900/30 transition-colors"
                >
                  Approve all {TYPE_LABEL[filter as ReviewIssue['type']].toLowerCase()}
                </button>
              )}
            </div>

            {/* Issue list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-3" ref={listRef}>
              {visible.length === 0 && (
                <div className="text-center py-16 text-[hsl(215,15%,40%)] text-sm">No issues in this category</div>
              )}
              {visible.map((issue, visIdx) => {
                const pendingVisIdx = pendingVisible.indexOf(issue)
                const isFocused = issue.status === 'pending' && pendingVisIdx === focusedIdx
                return (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    isFocused={isFocused}
                    getCue={getCue}
                    context={getContext?.(issue.cueId)}
                    onApprove={() => doApprove(issue)}
                    onDismiss={() => { dismissIssue(issue.id); onMarkDirty?.() }}
                    onSeek={() => seekToCue(issue.cueId)}
                    onClick={() => { if (issue.status === 'pending') setFocusedIdx(pendingVisIdx) }}
                  />
                )
              })}
              {issues.length === 0 && (
                <div className="text-center py-16 text-[hsl(215,15%,40%)] text-sm">No issues found — transcript looks clean!</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function IssueCard({ issue, isFocused, getCue, context, onApprove, onDismiss, onSeek, onClick }: {
  issue: ReviewIssue
  isFocused: boolean
  getCue: CueLookup
  context?: { title: string; cueIndex: number; totalCues: number }
  onApprove: () => void
  onDismiss: () => void
  onSeek: () => void
  onClick: () => void
}) {
  const cue = getCue(issue.cueId)
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const approved = issue.status === 'approved'
  const dismissed = issue.status === 'dismissed'

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors cursor-pointer ${
        approved ? 'border-green-800/40 bg-green-900/10 opacity-60' :
        dismissed ? 'border-[hsl(220,15%,18%)] bg-[hsl(222,20%,10%)] opacity-40' :
        isFocused ? 'border-[hsl(210,80%,45%)] bg-[hsl(222,20%,16%)]' :
        'border-[hsl(220,15%,22%)] bg-[hsl(222,20%,14%)] hover:border-[hsl(220,15%,30%)]'
      }`}
    >
      {/* Top row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={(e) => { e.stopPropagation(); onSeek() }}
          className="text-[10px] font-mono text-[hsl(210,80%,60%)] hover:text-white transition-colors"
          title="Seek to cue"
        >
          {cue ? `${fmt(cue.startSeconds)} → ${fmt(cue.endSeconds)}` : issue.cueId.slice(0, 8)}
        </button>
        {context && (
          <span className="text-[10px] text-[hsl(215,15%,50%)] truncate max-w-[220px]" title={context.title}>
            {context.title} · cue {context.cueIndex}/{context.totalCues}
          </span>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${TYPE_COLOR[issue.type]}`}>
          {TYPE_LABEL[issue.type]}
        </span>
        <span className={`text-[10px] font-medium ${CONF_COLOR[issue.confidence]}`}>
          {issue.confidence} confidence
        </span>
        {approved && <span className="ml-auto text-[10px] text-green-400 font-medium">✓ Applied</span>}
        {dismissed && <span className="ml-auto text-[10px] text-[hsl(215,15%,40%)]">Dismissed</span>}
        {isFocused && !approved && !dismissed && (
          <span className="ml-auto text-[10px] text-[hsl(210,80%,55%)]">focused</span>
        )}
      </div>

      {/* Problem description */}
      <p className="text-xs text-[hsl(215,15%,65%)] leading-relaxed">{issue.problem}</p>

      {/* Before / after comparison */}
      {(issue.suggestedArabic || issue.suggestedEnglish) && !approved && !dismissed && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wide text-[hsl(215,15%,38%)]">Current</span>
            {cue?.arabic && (
              <p className="text-xs text-[hsl(210,20%,65%)] bg-[hsl(222,20%,10%)] rounded px-2 py-1.5 font-arabic leading-relaxed text-right" dir="rtl">
                {cue.arabic}
              </p>
            )}
            {cue?.english && (
              <p className="text-xs text-[hsl(210,20%,65%)] bg-[hsl(222,20%,10%)] rounded px-2 py-1.5 leading-relaxed">
                {cue.english}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wide text-green-600">Suggested</span>
            {issue.suggestedArabic && (
              <p className="text-xs text-[hsl(210,20%,85%)] bg-green-900/20 border border-green-800/30 rounded px-2 py-1.5 font-arabic leading-relaxed text-right" dir="rtl">
                {issue.suggestedArabic}
              </p>
            )}
            {issue.suggestedEnglish && (
              <p className="text-xs text-[hsl(210,20%,85%)] bg-green-900/20 border border-green-800/30 rounded px-2 py-1.5 leading-relaxed">
                {issue.suggestedEnglish}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!approved && !dismissed && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onApprove}
            className="px-3 py-1.5 text-xs rounded-lg bg-green-800/50 hover:bg-green-700/60 text-green-300 border border-green-700/40 font-medium transition-colors"
          >
            Approve {isFocused && <span className="opacity-50 ml-1">[Y]</span>}
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs rounded-lg bg-[hsl(222,20%,20%)] hover:bg-[hsl(222,20%,26%)] text-[hsl(215,15%,55%)] border border-[hsl(220,15%,25%)] transition-colors"
          >
            Dismiss {isFocused && <span className="opacity-50 ml-1">[N]</span>}
          </button>
        </div>
      )}
    </div>
  )
}
