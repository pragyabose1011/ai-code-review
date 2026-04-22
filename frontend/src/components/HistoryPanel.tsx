import { useState, useEffect, useCallback } from 'react'
import { Clock, FileCode, AlertCircle, AlertTriangle, ChevronRight, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { ReviewSummary, ReviewReport } from '../types'

interface Props {
  currentFilename?: string
  onLoadReview: (report: ReviewReport, summary: ReviewSummary) => void
}

function Sparkline({ data }: { data: ReviewSummary[] }) {
  if (data.length < 2) return null
  const scores = data.map(d => d.score)
  const min = Math.min(...scores), max = Math.max(...scores)
  const range = max - min || 1
  const w = 72, h = 20
  const pts = scores.map((s, i) => `${(i / (scores.length - 1)) * w},${h - ((s - min) / range) * h}`).join(' ')
  const last = scores[scores.length - 1]
  const prev = scores[scores.length - 2]
  const color = last >= prev ? '#22c55e' : '#ef4444'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(scores.length - 1) / (scores.length - 1) * w} cy={h - ((last - min) / range) * h} r="2.5" fill={color} />
    </svg>
  )
}

function ScoreDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="flex items-center gap-0.5 text-slate-500 text-xs"><Minus size={10} /> 0</span>
  return delta > 0
    ? <span className="flex items-center gap-0.5 text-green-400 text-xs"><TrendingUp size={10} />+{delta}</span>
    : <span className="flex items-center gap-0.5 text-red-400 text-xs"><TrendingDown size={10} />{delta}</span>
}

export function HistoryPanel({ currentFilename, onLoadReview }: Props) {
  const { authFetch } = useAuth()
  const [reviews, setReviews] = useState<ReviewSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingId, setLoadingId] = useState<number | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/history')
      if (res.ok) setReviews(await res.json())
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const loadReview = async (id: number) => {
    setLoadingId(id)
    try {
      const res = await authFetch(`/api/history/${id}`)
      if (res.ok) {
        const data = await res.json()
        onLoadReview(data.report, data.summary)
      }
    } finally {
      setLoadingId(null)
    }
  }

  // Group by filename for sparklines
  const byFile: Record<string, ReviewSummary[]> = {}
  for (const r of [...reviews].reverse()) {
    if (!byFile[r.filename]) byFile[r.filename] = []
    byFile[r.filename].push(r)
  }

  const scoreColor = (s: number) => s >= 80 ? 'text-green-400' : s >= 50 ? 'text-amber-400' : 'text-red-400'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw size={18} className="text-slate-500 animate-spin" />
      </div>
    )
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center px-4">
        <Clock size={24} className="text-slate-600 mb-2" />
        <p className="text-slate-500 text-sm">No reviews yet</p>
        <p className="text-slate-600 text-xs mt-1">Reviews appear here after you analyze code</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-xs text-slate-500">{reviews.length} review{reviews.length > 1 ? 's' : ''}</span>
        <button onClick={fetchHistory} className="text-slate-600 hover:text-slate-400 transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {reviews.map((r, idx) => {
        const fileReviews = byFile[r.filename] ?? []
        const pos = fileReviews.indexOf(r)
        const prev = fileReviews[pos - 1]
        const delta = prev ? r.score - prev.score : null
        const isCurrent = r.filename === currentFilename

        return (
          <button key={r.id} onClick={() => loadReview(r.id)}
            className={`w-full text-left p-3 rounded-lg border transition-all group ${
              isCurrent
                ? 'border-indigo-700/60 bg-indigo-950/30'
                : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-800/40'
            }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileCode size={12} className="text-slate-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-300 truncate">{r.filename}</span>
                  {isCurrent && (
                    <span className="text-xs px-1.5 py-0.5 bg-indigo-900/50 text-indigo-400 rounded flex-shrink-0">current</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className={`text-lg font-bold ${scoreColor(r.score)}`}>{r.score}</span>
                  {delta !== null && <ScoreDelta delta={delta} />}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {r.critical_count > 0 && (
                      <span className="flex items-center gap-0.5 text-red-400">
                        <AlertCircle size={10} />{r.critical_count}
                      </span>
                    )}
                    {r.warning_count > 0 && (
                      <span className="flex items-center gap-0.5 text-amber-400">
                        <AlertTriangle size={10} />{r.warning_count}
                      </span>
                    )}
                  </div>
                  {fileReviews.length > 1 && pos === fileReviews.length - 1 && (
                    <Sparkline data={fileReviews} />
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  {new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors mt-1 flex-shrink-0" />
            </div>

            {loadingId === r.id && (
              <div className="mt-2 text-xs text-indigo-400 flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> Loading…
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
