import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getApiBase } from '../utils/api'

export const AUTH_TOKEN_KEY = 'auth_token'

export interface AuthUser {
  id: string
  /** 用户自定义 ID（密码注册用户） */
  userId?: string
  /** 手机号（短信登录用户，后续开通短信用） */
  phone?: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (user: AuthUser, token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const login = useCallback((u: AuthUser, token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    setUser(null)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    const base = getApiBase() || (typeof window !== 'undefined' ? window.location.origin : '')
    fetch(`${base}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('')
        return res.json()
      })
      .then((data) => setUser(data?.user ?? null))
      .catch(() => localStorage.removeItem(AUTH_TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** 展示用：优先 userId，否则手机号脱敏 */
export function displayName(user: AuthUser | null): string {
  if (!user) return ''
  if (user.userId) return user.userId
  if (user.phone) return maskPhone(user.phone)
  return user.id.slice(0, 8) + '…'
}

/** 手机号脱敏：13800138000 -> 138****8000 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}
