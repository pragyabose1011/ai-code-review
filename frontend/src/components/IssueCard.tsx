import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, AlertCircle, Info, Shield, Code2, Flame, Wrench, Copy, Check } from 'lucide-react'
import type { Issue, Severity } from '../types'

interface IssueCardProps {
  issue: Issue
  onLineClick?: (line: number) => void
  onApplyFix?: (issue: Issue) => void
}

const severityConfig: Record<Severity, {
  icon: React.ElementType; color: string; bg: string; border: string; badge: string
}> = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-950/40',
    border: 'border-red-800/60',
    badge: 'bg-red-900/60 text-red-300 border border-red-700/50',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-950/40',
    border: 'border-amber-800/60',
    badge: 'bg-amber-900/60 text-amber-300 border border-amber-700/50',
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-950/30',
    border: 'border-blue-800/60',
    badge: 'bg-blue-900/60 text-blue-300 border border-blue-700/50',
  },
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded border border-slate-700 hover:border-slate-500">
      {copied ? <><Check size={11} className="text-green-400" /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  )
}

export function IssueCard({ issue, onLineClick, onApplyFix }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [applied, setApplied] = useState(false)
  const cfg = severityConfig[issue.severity]
  const Icon = cfg.icon
  const isHighConfidence = issue.confidence >= 2

  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation()
    onApplyFix?.(issue)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  return (
    <div className={`rounded-lg border ${cfg.bg} ${cfg.border} transition-all duration-200`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-start gap-3 hover:opacity-90 transition-opacity"
      >
        <Icon className={`${cfg.color} mt-0.5 flex-shrink-0`} size={18} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-100 text-sm">{issue.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${cfg.badge}`}>
              {issue.severity}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50 flex items-center gap-1">
              {issue.category === 'security' ? <Shield size={10} /> : <Code2 size={10} />}
              {issue.category}
            </span>
            {isHighConfidence && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-300 border border-orange-700/40 flex items-center gap-1"
                title="Both agents independently flagged this">
                <Flame size={10} /> confirmed
              </span>
            )}
            {issue.fix && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 flex items-center gap-1">
                <Wrench size={10} /> fix available
              </span>
            )}
            {issue.line_start && (
              <button
                onClick={e => { e.stopPropagation(); onLineClick?.(issue.line_start!) }}
                className="text-xs text-slate-500 font-mono hover:text-indigo-400 hover:underline transition-colors"
              >
                line {issue.line_start}{issue.line_end && issue.line_end !== issue.line_start ? `–${issue.line_end}` : ''}
              </button>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-1 line-clamp-2">{issue.description}</p>
        </div>
        <div className="flex-shrink-0 ml-2 mt-0.5">
          {expanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/40 pt-3">
          <p className="text-sm text-slate-300 leading-relaxed">{issue.description}</p>

          {issue.code_snippet && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Affected Code</p>
              <pre className="text-xs bg-slate-900 rounded-md p-3 overflow-x-auto border border-slate-700/50 text-slate-300 font-mono leading-relaxed">
                {issue.code_snippet}
              </pre>
            </div>
          )}

          {issue.fix && (
            <div className="rounded-md border border-emerald-800/50 bg-emerald-950/30 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-800/40">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Wrench size={11} /> Suggested Fix
                </span>
                <div className="flex items-center gap-2">
                  <CopyButton text={issue.fix} />
                  {onApplyFix && (
                    <button
                      onClick={handleApply}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all ${
                        applied
                          ? 'border-emerald-600 bg-emerald-900/50 text-emerald-300'
                          : 'border-emerald-700 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/60'
                      }`}
                    >
                      {applied ? <><Check size={11} /> Applied</> : <><Wrench size={11} /> Apply</>}
                    </button>
                  )}
                </div>
              </div>
              <pre className="text-xs p-3 overflow-x-auto text-emerald-200 font-mono leading-relaxed">
                {issue.fix}
              </pre>
            </div>
          )}

          {issue.suggestion && (
            <div className="flex gap-2">
              <div className="flex-shrink-0 w-1 bg-green-600 rounded-full" />
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Note</p>
                <p className="text-sm text-green-300 leading-relaxed">{issue.suggestion}</p>
              </div>
            </div>
          )}

          {issue.reference && (
            <p className="text-xs text-slate-500 font-mono">
              Ref: <span className="text-slate-400">{issue.reference}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
