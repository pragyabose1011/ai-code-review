import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'ai_review_auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const _setUser = (u: AuthUser | null) => {
    setUser(u)
    if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    else localStorage.removeItem(STORAGE_KEY)
  }

  const _call = async (endpoint: string, body: object) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!res.ok) throw new Error(data.detail ?? `Server error ${res.status}`)
    return data
  }

  const login = useCallback(async (username: string, password: string) => {
    const data = await _call('/api/auth/login', { username, password })
    _setUser({ id: data.id, username: data.username, token: data.token })
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    const data = await _call('/api/auth/register', { username, password })
    _setUser({ id: data.id, username: data.username, token: data.token })
  }, [])

  const logout = useCallback(() => _setUser(null), [])

  const authFetch = useCallback((input: RequestInfo, init: RequestInit = {}) => {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> ?? {}) }
    if (user?.token) headers['Authorization'] = `Bearer ${user.token}`
    return fetch(input, { ...init, headers })
  }, [user])

  return (
    <AuthContext.Provider value={{ user, login, register, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
