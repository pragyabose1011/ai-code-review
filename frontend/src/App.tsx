import { useState, useCallback, useRef } from 'react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { Zap, ChevronRight, RotateCcw, GitCompare, Link, X, AlertCircle, User, LogOut, History, Clock, GitPullRequest, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ReviewReport } from './components/ReviewReport'
import { AgentTimeline } from './components/AgentTimeline'
import { AuthModal } from './components/AuthModal'
import { HistoryPanel } from './components/HistoryPanel'
import { PRPanel, FetchPRInput } from './components/PRPanel'
import { RepoBrowser } from './components/RepoBrowser'
import { useStreamingReview } from './hooks/useStreamingReview'
import { useAuth } from './context/AuthContext'
import type { ReviewReport as ReviewReportType, ReviewSummary, TrendData, PRInfo, PRFile, Issue } from './types'

const EXAMPLE_CODE = `import sqlite3
import os
import yaml

class UserDB:
    def __init__(self):
        self.SECRET_KEY = "super_secret_password_123"
        self.db = sqlite3.connect("users.db")

    def get_user(self, user_id):
        query = "SELECT * FROM users WHERE id = " + user_id
        return self.db.execute(query).fetchone()

    def load_config(self, path):
        with open(path) as f:
            return yaml.load(f.read())

    def run_command(self, cmd):
        os.system("ls " + cmd)

def process(data=[]):
    try:
        result = eval(data)
        return result
    except:
        pass
`

const LANG_MAP: Record<string, string> = {
  '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
  '.tsx': 'typescript', '.jsx': 'javascript', '.java': 'java',
  '.go': 'go', '.rs': 'rust', '.sql': 'sql', '.sh': 'shell',
}

function filenameToLang(name: string) {
  return LANG_MAP['.' + name.split('.').pop()] ?? 'python'
}

type RightPanel = 'report' | 'history' | 'pr'

export default function App() {
  const { user, logout } = useAuth()

  const [code, setCode] = useState(EXAMPLE_CODE)
  const [originalCode, setOriginalCode] = useState('')
  const [filename, setFilename] = useState('example.py')
  const [diffMode, setDiffMode] = useState(false)
  const [githubUrl, setGithubUrl] = useState('')
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubError, setGithubError] = useState('')
  const [showGithubInput, setShowGithubInput] = useState(false)
  const [repoBrowserUrl, setRepoBrowserUrl] = useState<string | null>(null)
  const [decorationIds, setDecorationIds] = useState<string[]>([])
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [rightPanel, setRightPanel] = useState<RightPanel>('report')
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [prInfo, setPrInfo] = useState<PRInfo | null>(null)

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)

  const { agents, report, loading, error, startReview, reset, loadReport } = useStreamingReview({
    onSaved: (t) => { if (t) setTrend(t) }
  })

  const hasReport = !!report || !!error

  const handleReview = useCallback(() => {
    if (!code.trim()) return
    setTrend(null)
    setRightPanel('report')
    startReview(code, filename || undefined, diffMode ? originalCode : undefined, user?.token)
  }, [code, filename, diffMode, originalCode, startReview, user])

  const handleReset = () => {
    reset()
    setTrend(null)
    setDecorationIds([])
    if (editorRef.current && monacoRef.current) {
      editorRef.current.deltaDecorations(decorationIds, [])
    }
  }

  const handleApplyFix = useCallback((issue: Issue) => {
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco || !issue.fix) return
    const model = ed.getModel()
    if (!model) return

    if (issue.code_snippet) {
      const matches = model.findMatches(issue.code_snippet, false, false, false, null, true)
      if (matches.length > 0) {
        ed.executeEdits('apply-fix', [{ range: matches[0].range, text: issue.fix }])
        ed.revealLineInCenter(matches[0].range.startLineNumber)
        return
      }
    }

    if (issue.line_start) {
      const endLine = issue.line_end ?? issue.line_start
      const range = new monaco.Range(issue.line_start, 1, endLine, model.getLineMaxColumn(endLine))
      ed.executeEdits('apply-fix', [{ range, text: issue.fix }])
      ed.revealLineInCenter(issue.line_start)
    }
  }, [])

  const handleLineClick = useCallback((line: number) => {
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco) return
    ed.revealLineInCenter(line)
    ed.focus()
    const ids = ed.deltaDecorations(decorationIds, [{
      range: new monaco.Range(line, 1, line, 9999),
      options: { isWholeLine: true, className: 'highlighted-line', overviewRuler: { color: '#818cf8', position: 1 } },
    }])
    setDecorationIds(ids)
  }, [decorationIds])

  const isRepoUrl = (url: string) =>
    /^https?:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(url.trim())

  const fetchGithub = async () => {
    if (!githubUrl.trim()) return
    if (isRepoUrl(githubUrl)) {
      setRepoBrowserUrl(githubUrl.trim())
      setShowGithubInput(false)
      setGithubUrl('')
      return
    }
    setGithubLoading(true)
    setGithubError('')
    try {
      const res = await fetch(`/api/fetch-github?url=${encodeURIComponent(githubUrl)}`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail ?? 'Failed to fetch') }
      const data = await res.json()
      setCode(data.code)
      setFilename(data.filename)
      setShowGithubInput(false)
      setGithubUrl('')
    } catch (e: unknown) {
      setGithubError((e as Error).message)
    } finally {
      setGithubLoading(false)
    }
  }

  const handleLoadHistory = (histReport: ReviewReportType, summary: ReviewSummary) => {
    setFilename(summary.filename)
    setRightPanel('report')
    setTrend(null)
    loadReport(histReport)
  }

  const handlePRFile = (file: PRFile) => {
    setCode(file.added_code)
    setFilename(file.filename)
    setRightPanel('report')
  }

  const lang = filenameToLang(filename)

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col" style={{ height: '100vh' }}>
      {/* Navbar */}
      <header className="border-b border-slate-800 px-5 py-3 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap size={15} className="text-white" />
          </div>
          <span className="font-semibold text-slate-100 text-sm">AI Code Review</span>
          <span className="hidden sm:block text-xs px-2 py-0.5 bg-indigo-900/50 text-indigo-400 border border-indigo-800/50 rounded-full">
            5-agent pipeline
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => { setShowGithubInput(v => !v); setGithubError('') }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-all ${showGithubInput ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}>
            <Link size={12} /> File URL
          </button>
          <button onClick={() => setDiffMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-all ${diffMode ? 'bg-purple-900/40 border-purple-700 text-purple-300' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}>
            <GitCompare size={12} /> Diff
          </button>
          <button onClick={() => setRightPanel(p => p === 'pr' ? 'report' : 'pr')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-all ${rightPanel === 'pr' ? 'bg-purple-900/40 border-purple-700 text-purple-300' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}>
            <GitPullRequest size={12} /> PR Review
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setRightPanel(p => p === 'history' ? 'report' : 'history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-all ${rightPanel === 'history' ? 'bg-slate-700 border-slate-600 text-slate-200' : 'text-slate-400 border-slate-700 hover:text-slate-200'}`}>
                <History size={12} /> History
              </button>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 border border-slate-700 rounded-lg px-3 py-1.5">
                <User size={12} className="text-indigo-400" />
                <span>{user.username}</span>
              </div>
              <button onClick={logout} className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 rounded-lg transition-all">
              <User size={12} /> Sign in
            </button>
          )}
        </div>
      </header>

      {/* GitHub URL bar */}
      {showGithubInput && (
        <div className="border-b border-slate-800 bg-slate-900/50 px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 max-w-2xl">
            <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-slate-500">
              <Link size={13} className="text-slate-500 flex-shrink-0" />
              <input type="text" value={githubUrl} onChange={e => setGithubUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchGithub()}
                placeholder="https://github.com/user/repo  or  .../blob/main/file.py"
                className="flex-1 bg-transparent text-slate-300 text-sm outline-none" />
              {githubUrl && <button onClick={() => setGithubUrl('')}><X size={12} className="text-slate-500" /></button>}
            </div>
            <button onClick={fetchGithub} disabled={githubLoading || !githubUrl.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded-lg transition-all">
              {githubLoading ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
          {githubError && <p className="mt-2 text-xs text-red-400 flex items-center gap-1"><AlertCircle size={11} />{githubError}</p>}
        </div>
      )}

      {/* Main layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Editor */}
        <div className={`flex flex-col ${rightPanel !== 'report' || hasReport ? 'w-1/2' : 'w-full'} border-r border-slate-800 transition-all min-w-0`}>
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-2 flex-shrink-0">
            <input type="text" value={filename} onChange={e => setFilename(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 text-xs font-mono outline-none focus:border-slate-500" />
            {(hasReport || trend) && (
              <button onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-slate-700 rounded-lg hover:border-slate-600 transition-all">
                <RotateCcw size={12} /> Reset
              </button>
            )}
            <button onClick={handleReview} disabled={loading || !code.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-all">
              {loading ? <><Zap size={13} className="animate-pulse" />Analyzing…</> : <><Zap size={13} />Review<ChevronRight size={12} /></>}
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {diffMode ? (
              <div className="h-full flex flex-col">
                <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-500 flex gap-4 flex-shrink-0">
                  <span className="text-red-400">← Original</span>
                  <span className="text-green-400">Modified →</span>
                </div>
                <div className="flex-1">
                  <DiffEditor height="100%" language={lang} original={originalCode} modified={code}
                    onMount={ed => {
                      ed.getModifiedEditor().onDidChangeModelContent(() => setCode(ed.getModifiedEditor().getValue()))
                      ed.getOriginalEditor().onDidChangeModelContent(() => setOriginalCode(ed.getOriginalEditor().getValue()))
                    }}
                    theme="vs-dark" options={{ fontSize: 13, minimap: { enabled: false } }} />
                </div>
              </div>
            ) : (
              <Editor height="100%" language={lang} value={code} onChange={v => setCode(v ?? '')}
                onMount={(ed, monaco) => { editorRef.current = ed; monacoRef.current = monaco }}
                theme="vs-dark"
                options={{ fontSize: 13, fontFamily: "'JetBrains Mono','Fira Code',monospace", minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', padding: { top: 12 } }} />
            )}
          </div>

          <div className="border-t border-slate-800 p-4 flex-shrink-0 bg-slate-950/50">
            <AgentTimeline agents={agents} />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Panel tabs */}
          {(hasReport || rightPanel !== 'report') && (
            <div className="border-b border-slate-800 px-4 flex items-center gap-1 flex-shrink-0 bg-slate-950">
              {[
                { key: 'report' as RightPanel, label: 'Report', show: hasReport },
                { key: 'history' as RightPanel, label: 'History', show: !!user },
                { key: 'pr' as RightPanel, label: 'PR Review', show: true },
              ].filter(t => t.show).map(tab => (
                <button key={tab.key} onClick={() => setRightPanel(tab.key)}
                  className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-all ${
                    rightPanel === tab.key
                      ? 'border-indigo-500 text-slate-200'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5">
            {/* Report panel */}
            {rightPanel === 'report' && (
              <>
                {trend && <TrendBanner trend={trend} />}
                {error ? (
                  <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 text-center">
                    <AlertCircle size={22} className="text-red-400 mx-auto mb-2" />
                    <p className="text-red-400 font-medium mb-1">Review Failed</p>
                    <p className="text-red-300/70 text-sm">{error}</p>
                  </div>
                ) : report ? (
                  <ReviewReport report={report} onLineClick={handleLineClick} onApplyFix={handleApplyFix} />
                ) : !loading ? (
                  <EmptyState />
                ) : null}
              </>
            )}

            {/* History panel */}
            {rightPanel === 'history' && user && (
              <HistoryPanel currentFilename={filename} onLoadReview={handleLoadHistory} />
            )}

            {/* PR panel */}
            {rightPanel === 'pr' && (
              <div className="space-y-4">
                <FetchPRInput onFetched={(pr) => { setPrInfo(pr); setRightPanel('pr') }} />
                {prInfo && <PRPanel pr={prInfo} onSelectFile={(file) => { handlePRFile(file); handleReview() }} />}
              </div>
            )}
          </div>
        </div>
      </main>

      {repoBrowserUrl && (
        <RepoBrowser
          repoUrl={repoBrowserUrl}
          onFileSelect={(fileCode, fname) => { setCode(fileCode); setFilename(fname) }}
          onClose={() => setRepoBrowserUrl(null)}
        />
      )}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      <style>{`.highlighted-line { background: rgba(99,102,241,0.15) !important; border-left: 2px solid #818cf8; }`}</style>
    </div>
  )
}

function TrendBanner({ trend }: { trend: TrendData }) {
  const delta = trend.score_delta
  const improved = delta > 0
  const same = delta === 0
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border mb-4 text-sm ${
      improved ? 'bg-green-950/30 border-green-800/50' :
      same     ? 'bg-slate-800/50 border-slate-700' :
                 'bg-red-950/30 border-red-800/50'
    }`}>
      {improved ? <TrendingUp size={16} className="text-green-400 flex-shrink-0" /> :
       same     ? <Minus size={16} className="text-slate-400 flex-shrink-0" /> :
                  <TrendingDown size={16} className="text-red-400 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <span className={`font-semibold ${improved ? 'text-green-400' : same ? 'text-slate-400' : 'text-red-400'}`}>
          {improved ? `+${delta}` : delta} points {improved ? 'improved' : same ? 'unchanged' : 'declined'}
        </span>
        <span className="text-slate-500 text-xs ml-2">
          vs {new Date(trend.previous_date).toLocaleDateString()} ({trend.previous_score} → {trend.previous_score + delta})
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs flex-shrink-0">
        {trend.critical_delta !== 0 && (
          <span className={trend.critical_delta < 0 ? 'text-green-400' : 'text-red-400'}>
            {trend.critical_delta > 0 ? '+' : ''}{trend.critical_delta} critical
          </span>
        )}
        {trend.warning_delta !== 0 && (
          <span className={trend.warning_delta < 0 ? 'text-green-400' : 'text-amber-400'}>
            {trend.warning_delta > 0 ? '+' : ''}{trend.warning_delta} warnings
          </span>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
      <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700">
        <Zap size={26} className="text-indigo-500" />
      </div>
      <h3 className="text-slate-300 font-medium mb-2">Paste code and click Review</h3>
      <p className="text-slate-500 text-sm leading-relaxed max-w-xs mb-6">
        Watch 5 agents work live — security, quality, CVE lookup, dedup and scoring.
      </p>
      <div className="grid gap-2 text-left max-w-xs w-full">
        {[['Streaming pipeline', 'See each agent complete in real time'],
          ['Click-to-line', 'Jump to flagged lines in the editor'],
          ['Deduplication', 'Cross-agent confidence scoring'],
          ['PR Review', 'Paste a GitHub PR URL, pick a file'],
        ].map(([t, d]) => (
          <div key={t} className="flex gap-2 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
            <div><p className="text-slate-300 text-xs font-medium">{t}</p><p className="text-slate-600 text-xs">{d}</p></div>
          </div>
        ))}
      </div>
    </div>
  )
}

