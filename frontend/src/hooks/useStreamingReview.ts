import { useState, useCallback, useRef } from 'react'
import type { ReviewReport, AgentMap, AgentName, SSEEvent, TrendData } from '../types'

const INITIAL_AGENTS: AgentMap = {
  chunker:     { status: 'idle' },
  rag:         { status: 'idle' },
  security:    { status: 'idle' },
  quality:     { status: 'idle' },
  synthesizer: { status: 'idle' },
}

interface Options {
  onSaved?: (trend: TrendData | null) => void
}

export function useStreamingReview(options: Options = {}) {
  const [agents, setAgents] = useState<AgentMap>(INITIAL_AGENTS)
  const [report, setReport] = useState<ReviewReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setAgents(INITIAL_AGENTS)
    setReport(null)
    setError(null)
    setLoading(false)
  }, [])

  const loadReport = useCallback((r: ReviewReport) => {
    setReport(r)
    setError(null)
    setAgents(Object.fromEntries(
      Object.keys(INITIAL_AGENTS).map(k => [k, { status: 'done' as const }])
    ) as AgentMap)
  }, [])

  const startReview = useCallback(async (
    code: string,
    filename?: string,
    originalCode?: string,
    token?: string,
  ) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    setReport(null)
    setAgents(INITIAL_AGENTS)

    try {
      const endpoint = originalCode ? '/api/review/diff' : '/api/review/stream'
      const body = originalCode
        ? { original_code: originalCode, modified_code: code, filename }
        : { code, filename }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || `Server error ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break

          const event: SSEEvent = JSON.parse(raw)

          if (event.type === 'agent_start') {
            setAgents(prev => ({ ...prev, [event.agent]: { status: 'running' } }))
          } else if (event.type === 'agent_done') {
            const detail =
              event.agent === 'chunker' ? `${event.language} · ${event.chunks} chunks` :
              event.agent === 'rag'     ? `${event.rules} rules loaded` :
              event.issues_found !== undefined ? `${event.issues_found} issues` : undefined
            setAgents(prev => ({ ...prev, [event.agent]: { status: 'done', detail } }))
          } else if (event.type === 'complete') {
            setReport(event.report)
            setAgents(prev => ({ ...prev, synthesizer: { status: 'done' } }))
          } else if (event.type === 'saved') {
            options.onSaved?.(event.trend)
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message ?? 'Unknown error')
      }
    } finally {
      setLoading(false)
    }
  }, [options])

  return { agents, report, loading, error, startReview, reset, loadReport }
}
