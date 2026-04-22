import { useState } from 'react'
import { Shield, Code2, Info, AlertTriangle, AlertCircle, FileCode, Layers, Download, FileText, Flame } from 'lucide-react'
import type { ReviewReport as ReviewReportType, Severity } from '../types'
import { IssueCard } from './IssueCard'

import type { Issue } from '../types'

interface Props {
  report: ReviewReportType
  onLineClick?: (line: number) => void
  onApplyFix?: (issue: Issue) => void
}

type FilterType = 'all' | 'security' | 'quality' | Severity | 'confirmed'

export function ReviewReport({ report, onLineClick, onApplyFix }: Props) {
  const [filter, setFilter] = useState<FilterType>('all')

  const confirmedCount = report.issues.filter(i => i.confidence >= 2).length

  const filtered = report.issues.filter(issue => {
    if (filter === 'all') return true
    if (filter === 'confirmed') return issue.confidence >= 2
    if (filter === 'security' || filter === 'quality') return issue.category === filter
    return issue.severity === filter
  })

  const scoreColor = report.score >= 80 ? 'text-green-400' : report.score >= 50 ? 'text-amber-400' : 'text-red-400'
  const scoreRingColor = report.score >= 80 ? '#22c55e' : report.score >= 50 ? '#f59e0b' : '#ef4444'
  const radius = 48
  const circ = 2 * Math.PI * radius
  const offset = circ - (report.score / 100) * circ

  const filterButtons: { key: FilterType; label: string; count?: number; icon?: React.ElementType }[] = [
    { key: 'all',       label: 'All',       count: report.issues.length },
    { key: 'critical',  label: 'Critical',  count: report.critical_count,  icon: AlertCircle },
    { key: 'warning',   label: 'Warning',   count: report.warning_count,   icon: AlertTriangle },
    { key: 'info',      label: 'Info',      count: report.info_count,      icon: Info },
    { key: 'security',  label: 'Security',  icon: Shield },
    { key: 'quality',   label: 'Quality',   icon: Code2 },
    ...(confirmedCount > 0 ? [{ key: 'confirmed' as FilterType, label: 'Confirmed', count: confirmedCount, icon: Flame }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Score ring */}
          <div className="flex flex-col items-center relative flex-shrink-0">
            <svg width="120" height="120" className="-rotate-90">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="9" />
              <circle cx="60" cy="60" r={radius} fill="none" stroke={scoreRingColor} strokeWidth="9"
                strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${scoreColor}`}>{report.score}</span>
              <span className="text-xs text-slate-500">/100</span>
            </div>
            <span className={`text-sm font-semibold mt-1 ${scoreColor}`}>
              {report.score >= 80 ? 'Good' : report.score >= 50 ? 'Fair' : 'Poor'}
            </span>
          </div>

          <div className="flex-1 space-y-4 min-w-0">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold text-slate-100">Review Summary</h2>
                <ExportButtons report={report} />
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">{report.summary}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={FileCode}    label="Language" value={report.language} />
              <StatCard icon={Layers}      label="Lines"    value={report.total_lines.toString()} />
              <StatCard icon={AlertCircle} label="Critical" value={report.critical_count.toString()} color="text-red-400" />
              <StatCard icon={AlertTriangle} label="Warnings" value={report.warning_count.toString()} color="text-amber-400" />
            </div>

            {confirmedCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-orange-300 bg-orange-900/20 border border-orange-800/40 rounded-lg px-3 py-2">
                <Flame size={13} />
                <span>{confirmedCount} issue{confirmedCount > 1 ? 's' : ''} confirmed by both Security and Quality agents</span>
              </div>
            )}

            {report.diff_context && (
              <div className="flex items-center gap-2 text-xs text-indigo-300 bg-indigo-900/20 border border-indigo-800/40 rounded-lg px-3 py-2">
                <FileText size={13} />
                <span>Diff mode: reviewed {report.diff_context.total_changed_lines} changed lines across {report.diff_context.changed_ranges.length} section{report.diff_context.changed_ranges.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Issues */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Issues Found</h3>
          <span className="text-xs text-slate-500">{filtered.length} shown</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {filterButtons.map(({ key, label, count, icon: Icon }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filter === key
                  ? key === 'confirmed' ? 'bg-orange-700 border-orange-600 text-white'
                                        : 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}>
              {Icon && <Icon size={12} />}
              {label}
              {count !== undefined && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs ${
                  filter === key ? 'bg-white/20' : 'bg-slate-700 text-slate-400'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Shield size={32} className="mx-auto mb-3 opacity-30" />
              <p>No issues in this category</p>
            </div>
          ) : (
            filtered.map(issue => (
              <IssueCard key={issue.id} issue={issue} onLineClick={onLineClick} onApplyFix={onApplyFix} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Export buttons ────────────────────────────────────────────────────────────

function ExportButtons({ report }: { report: ReviewReportType }) {
  const exportMarkdown = () => {
    const lines: string[] = [
      `# Code Review Report`,
      ``,
      `**Language:** ${report.language}  `,
      `**Score:** ${report.score}/100  `,
      `**Lines:** ${report.total_lines}  `,
      `**Critical:** ${report.critical_count} | **Warnings:** ${report.warning_count} | **Info:** ${report.info_count}`,
      ``,
      `## Summary`,
      ``,
      report.summary,
      ``,
      `## Issues`,
      ``,
    ]

    for (const issue of report.issues) {
      const line = issue.line_start ? ` (line ${issue.line_start})` : ''
      const conf = issue.confidence >= 2 ? ' 🔥 **confirmed**' : ''
      lines.push(`### [${issue.severity.toUpperCase()}] ${issue.title}${line}${conf}`)
      lines.push(`**Category:** ${issue.category}`)
      lines.push(``)
      lines.push(issue.description)
      if (issue.suggestion) {
        lines.push(``)
        lines.push(`**Fix:** ${issue.suggestion}`)
      }
      if (issue.reference) lines.push(`**Ref:** ${issue.reference}`)
      lines.push(``)
      lines.push('---')
      lines.push(``)
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code-review-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const win = window.open('', '_blank')!
    const scoreColor = report.score >= 80 ? '#22c55e' : report.score >= 50 ? '#f59e0b' : '#ef4444'
    const sevColors: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }

    const issueRows = report.issues.map(issue => `
      <tr>
        <td style="color:${sevColors[issue.severity]};font-weight:600;text-transform:uppercase;font-size:11px">${issue.severity}</td>
        <td style="font-weight:500">${issue.title}${issue.confidence >= 2 ? ' 🔥' : ''}</td>
        <td style="color:#94a3b8;font-size:12px">${issue.category}</td>
        <td style="color:#94a3b8;font-size:12px">${issue.line_start ?? '—'}</td>
        <td style="font-size:12px;color:#cbd5e1">${issue.description.slice(0, 120)}${issue.description.length > 120 ? '…' : ''}</td>
      </tr>`).join('')

    win.document.write(`<!DOCTYPE html><html><head><title>Code Review Report</title>
    <style>
      body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;margin:0}
      h1{font-size:24px;margin-bottom:4px}
      .meta{color:#94a3b8;font-size:14px;margin-bottom:24px}
      .score{display:inline-block;font-size:48px;font-weight:700;color:${scoreColor}}
      .summary{background:#1e293b;border-radius:8px;padding:16px;margin-bottom:24px;font-size:14px;line-height:1.6;color:#cbd5e1}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{text-align:left;padding:10px 12px;background:#1e293b;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      td{padding:10px 12px;border-bottom:1px solid #1e293b;vertical-align:top}
      tr:hover td{background:#1e293b40}
      @media print{body{background:white;color:#0f172a}.summary{background:#f1f5f9}th{background:#f1f5f9;color:#475569}td{border-bottom:1px solid #e2e8f0}}
    </style></head><body>
    <h1>Code Review Report</h1>
    <div class="meta">${report.language} · ${report.total_lines} lines · ${new Date().toLocaleDateString()}</div>
    <div class="score">${report.score}<span style="font-size:20px;color:#94a3b8">/100</span></div>
    <div class="summary">${report.summary}</div>
    <table>
      <thead><tr><th>Severity</th><th>Issue</th><th>Category</th><th>Line</th><th>Description</th></tr></thead>
      <tbody>${issueRows}</tbody>
    </table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="flex gap-2">
      <button onClick={exportMarkdown}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition-all">
        <Download size={12} /> .md
      </button>
      <button onClick={exportPDF}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition-all">
        <FileText size={12} /> PDF
      </button>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color = 'text-slate-200' }: {
  icon: React.ElementType; label: string; value: string; color?: string
}) {
  return (
    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/40">
      <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
        <Icon size={12} />{label}
      </div>
      <p className={`text-sm font-semibold ${color} capitalize`}>{value}</p>
    </div>
  )
}
