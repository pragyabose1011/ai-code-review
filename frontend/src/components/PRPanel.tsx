import { useState } from 'react'
import { GitPullRequest, FileCode, Plus, Minus, AlertCircle, Loader2, ChevronRight } from 'lucide-react'
import type { PRInfo, PRFile } from '../types'

interface Props {
  pr: PRInfo
  onSelectFile: (file: PRFile) => void
}

export function PRPanel({ pr, onSelectFile }: Props) {
  return (
    <div className="space-y-4">
      {/* PR header */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <GitPullRequest size={18} className="text-purple-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 leading-snug">{pr.title}</h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
              <span className="font-mono bg-slate-900 px-2 py-0.5 rounded">{pr.head}</span>
              <ChevronRight size={10} />
              <span className="font-mono bg-slate-900 px-2 py-0.5 rounded">{pr.base}</span>
              <span>by <span className="text-slate-400">{pr.author}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Changed files */}
      <div>
        <p className="text-xs text-slate-500 mb-2 px-1">{pr.files.length} changed file{pr.files.length !== 1 ? 's' : ''} — click to review</p>
        <div className="space-y-1.5">
          {pr.files.map(file => (
            <button key={file.filename} onClick={() => onSelectFile(file)}
              className="w-full text-left p-3 bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 rounded-lg transition-all group">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode size={13} className="text-slate-500 flex-shrink-0" />
                  <span className="text-xs font-mono text-slate-300 truncate">{file.filename}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                    file.status === 'added'    ? 'bg-green-900/40 text-green-400' :
                    file.status === 'removed'  ? 'bg-red-900/40 text-red-400' :
                                                 'bg-slate-800 text-slate-500'
                  }`}>{file.status}</span>
                </div>
                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                  {file.additions > 0 && (
                    <span className="flex items-center gap-0.5 text-green-400"><Plus size={10} />{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="flex items-center gap-0.5 text-red-400"><Minus size={10} />{file.deletions}</span>
                  )}
                  <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface FetchPRProps {
  onFetched: (pr: PRInfo) => void
}

export function FetchPRInput({ onFetched }: FetchPRProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetch_ = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/fetch-pr?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Failed to fetch PR')
      onFetched(data)
      setUrl('')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-slate-500">
          <GitPullRequest size={13} className="text-slate-500 flex-shrink-0" />
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetch_()}
            placeholder="https://github.com/owner/repo/pull/123"
            className="flex-1 bg-transparent text-slate-300 text-sm outline-none placeholder:text-slate-600" />
        </div>
        <button onClick={fetch_} disabled={loading || !url.trim()}
          className="px-3 py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded-lg transition-all flex items-center gap-1.5">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <GitPullRequest size={13} />}
          Fetch
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={11} />{error}</p>
      )}
    </div>
  )
}
