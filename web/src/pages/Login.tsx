import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getApiBase } from '../utils/api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string })?.returnTo || '/'
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const base = getApiBase() || (typeof window !== 'undefined' ? window.location.origin : '')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = userId.trim()
    if (!trimmed || !password) {
      setMessage({ type: 'error', text: '请输入用户 ID 和密码' })
      return
    }
    setLoginLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: trimmed, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '登录失败' })
        return
      }
      if (data.token && data.user) {
        login(data.user, data.token)
        setMessage({ type: 'success', text: '登录成功' })
        setTimeout(() => navigate(returnTo, { replace: true }), 500)
      } else {
        setMessage({ type: 'error', text: '登录失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络异常，请稍后重试' })
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-gray-900 gradient-text">登录</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          使用用户 ID 和密码登录；未注册请先
          <Link to="/register" className="text-[var(--color-primary)] hover:underline ml-1">
            注册
          </Link>
          。
        </p>
      </div>
      <form onSubmit={handleLogin} className="card-flat p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">用户 ID</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="4～24 位字母、数字或下划线"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            maxLength={24}
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            autoComplete="current-password"
          />
        </div>
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
        <button type="submit" className="btn-flat btn-primary w-full" disabled={loginLoading}>
          {loginLoading ? '登录中…' : '登录'}
        </button>
      </form>
      <p className="text-center text-sm text-[var(--color-text-muted)]">
        <Link to="/" className="text-[var(--color-primary)] hover:underline">
          返回首页
        </Link>
      </p>
    </div>
  )
}
