import { useState, useEffect } from 'react'
import { Folder, FileCode, ChevronRight, ChevronLeft, Loader2, AlertCircle, Github } from 'lucide-react'

interface RepoItem {
  name: string
  type: 'file' | 'dir'
  path: string
  size: number
  download_url: string | null
}

interface Props {
  repoUrl: string
  onFileSelect: (code: string, filename: string) => void
  onClose: () => void
}

const CODE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs',
  '.cpp', '.c', '.h', '.cs', '.rb', '.php', '.swift', '.kt',
  '.sql', '.sh', '.yaml', '.yml', '.json', '.toml', '.env.example'
])

function isCodeFile(name: string) {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return CODE_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

export function RepoBrowser({ repoUrl, onFileSelect, onClose }: Props) {
  const [path, setPath] = useState('')
  const [items, setItems] = useState<RepoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<string[]>([])

  const loadPath = async (p: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/fetch-repo?url=${encodeURIComponent(repoUrl)}&path=${encodeURIComponent(p)}`)
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail ?? 'Failed to load')
      }
      setItems(await res.json())
      setPath(p)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPath('') }, [])

  const navigate = (item: RepoItem) => {
    if (item.type === 'dir') {
      setHistory(h => [...h, path])
      loadPath(item.path)
    }
  }

  const goBack = () => {
    const prev = history[history.length - 1] ?? ''
    setHistory(h => h.slice(0, -1))
    loadPath(prev)
  }

  const selectFile = async (item: RepoItem) => {
    if (!item.download_url) return
    setFetching(item.name)
    try {
      const res = await fetch(item.download_url)
      if (!res.ok) throw new Error('Failed to fetch file')
      const code = await res.text()
      onFileSelect(code, item.name)
      onClose()
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setFetching(null)
    }
  }

  const repoName = repoUrl.split('/').slice(-2).join('/')
  const pathParts = path ? path.split('/') : []

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Github size={16} className="text-slate-400 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-200 truncate">{repoName}</span>
            {pathParts.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-slate-500 min-w-0">
                {pathParts.map((part, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <ChevronRight size={10} />
                    <span className="truncate max-w-[80px]">{part}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 border border-slate-700 rounded-lg transition-colors flex-shrink-0 ml-2">
            ✕ Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs p-3 bg-red-950/30 rounded-lg border border-red-800/40 m-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="text-slate-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Back button */}
              {history.length > 0 && (
                <button onClick={goBack}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 rounded-lg transition-colors">
                  <ChevronLeft size={15} />
                  <span className="font-mono text-xs">..</span>
                </button>
              )}

              {items.map(item => {
                const canReview = item.type === 'file' && isCodeFile(item.name)
                const isFetching = fetching === item.name

                return (
                  <button key={item.path}
                    onClick={() => item.type === 'dir' ? navigate(item) : canReview ? selectFile(item) : undefined}
                    disabled={item.type === 'file' && !canReview}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                      item.type === 'dir'
                        ? 'hover:bg-slate-800 text-slate-300'
                        : canReview
                          ? 'hover:bg-slate-800 text-slate-300'
                          : 'text-slate-600 cursor-default'
                    }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {item.type === 'dir'
                        ? <Folder size={15} className="text-amber-400/70 flex-shrink-0" />
                        : <FileCode size={15} className={canReview ? 'text-indigo-400/70' : 'text-slate-600'} />}
                      <span className="text-sm font-mono truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.type === 'file' && item.size > 0 && (
                        <span className="text-xs text-slate-600">
                          {item.size > 1024 ? `${(item.size / 1024).toFixed(1)}KB` : `${item.size}B`}
                        </span>
                      )}
                      {isFetching
                        ? <Loader2 size={13} className="text-indigo-400 animate-spin" />
                        : item.type === 'dir'
                          ? <ChevronRight size={13} className="text-slate-600" />
                          : canReview
                            ? <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100">Review</span>
                            : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-600 flex-shrink-0">
          Click any highlighted file to load it into the editor
        </div>
      </div>
    </div>
  )
}
