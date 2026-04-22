import { CheckCircle2, Circle, Loader2, ChevronRight } from 'lucide-react'
import type { AgentMap, AgentName } from '../types'

const AGENTS: { key: AgentName; label: string; desc: string }[] = [
  { key: 'chunker',     label: 'Chunker',        desc: 'Detect language & split into logical blocks' },
  { key: 'rag',         label: 'RAG Retriever',   desc: 'Fetch relevant security & quality rules' },
  { key: 'security',    label: 'Security Agent',  desc: 'CVE lookup, OWASP checks, vulnerability scan' },
  { key: 'quality',     label: 'Quality Agent',   desc: 'Complexity scoring, code smell detection' },
  { key: 'synthesizer', label: 'Synthesizer',     desc: 'Deduplicate, score & generate final report' },
]

interface Props {
  agents: AgentMap
}

export function AgentTimeline({ agents }: Props) {
  return (
    <div className="space-y-1">
      {AGENTS.map(({ key, label, desc }, idx) => {
        const { status, detail } = agents[key]
        const isRunning = status === 'running'
        const isDone = status === 'done'

        return (
          <div key={key} className="flex gap-3 items-start">
            {/* Connector line */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                isDone    ? 'bg-green-900/60 border border-green-600/60' :
                isRunning ? 'bg-indigo-900/60 border border-indigo-500/60' :
                            'bg-slate-800 border border-slate-700'
              }`}>
                {isDone    ? <CheckCircle2 size={14} className="text-green-400" /> :
                 isRunning ? <Loader2 size={14} className="text-indigo-400 animate-spin" /> :
                             <Circle size={14} className="text-slate-600" />}
              </div>
              {idx < AGENTS.length - 1 && (
                <div className={`w-px flex-1 min-h-[16px] my-0.5 transition-colors duration-500 ${
                  isDone ? 'bg-green-700/40' : 'bg-slate-700/50'
                }`} />
              )}
            </div>

            {/* Label */}
            <div className="pb-3 pt-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium transition-colors ${
                  isDone    ? 'text-slate-200' :
                  isRunning ? 'text-indigo-300' :
                              'text-slate-500'
                }`}>
                  {label}
                </span>
                {isRunning && (
                  <span className="text-xs text-indigo-400 animate-pulse">running…</span>
                )}
                {isDone && detail && (
                  <span className="text-xs text-slate-500 font-mono">{detail}</span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{desc}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
