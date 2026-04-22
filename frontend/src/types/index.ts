export type Severity = 'critical' | 'warning' | 'info'

export interface Issue {
  id: string
  title: string
  description: string
  severity: Severity
  line_start: number | null
  line_end: number | null
  code_snippet: string | null
  fix: string | null
  suggestion: string | null
  reference: string | null
  category: string
  confidence: number
}

export interface ReviewReport {
  language: string
  total_lines: number
  chunks_analyzed: number
  issues: Issue[]
  summary: string
  score: number
  critical_count: number
  warning_count: number
  info_count: number
  diff_context?: { changed_ranges: { start: number; end: number }[]; total_changed_lines: number }
}

export type AgentName = 'chunker' | 'rag' | 'security' | 'quality' | 'synthesizer'
export type AgentStatus = 'idle' | 'running' | 'done'
export interface AgentState { status: AgentStatus; detail?: string }
export type AgentMap = Record<AgentName, AgentState>

export type SSEEvent =
  | { type: 'agent_start'; agent: AgentName }
  | { type: 'agent_done'; agent: AgentName; language?: string; chunks?: number; rules?: number; issues_found?: number }
  | { type: 'complete'; report: ReviewReport }
  | { type: 'saved'; review_id: number; trend: TrendData | null }

export interface TrendData {
  score_delta: number
  critical_delta: number
  warning_delta: number
  previous_score: number
  previous_date: string
  previous_id: number
}

export interface ReviewSummary {
  id: number
  filename: string
  language: string
  score: number
  critical_count: number
  warning_count: number
  info_count: number
  total_issues: number
  created_at: string
}

export interface AuthUser {
  id: number
  username: string
  token: string
}

export interface PRFile {
  filename: string
  status: string
  additions: number
  deletions: number
  added_code: string
  line_map: number[]
}

export interface PRInfo {
  title: string
  author: string
  base: string
  head: string
  files: PRFile[]
}
