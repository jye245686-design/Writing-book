import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getApiBase } from '../utils/api'

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const base = getApiBase() || (typeof window !== 'undefined' ? window.location.origin : '')

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = userId.trim()
    if (!trimmed || !password) {
      setMessage({ type: 'error', text: '请输入用户 ID 和密码' })
      return
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: '密码至少 6 位' })
      return
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的密码不一致' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: trimmed, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '注册失败' })
        return
      }
      if (data.token && data.user) {
        login(data.user, data.token)
        setMessage({ type: 'success', text: '注册成功' })
        setTimeout(() => navigate('/', { replace: true }), 500)
      } else {
        setMessage({ type: 'error', text: '注册失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '网络异常，请稍后重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-gray-900 gradient-text">注册</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          自定义用户 ID 和密码，注册后即可登录。
        </p>
      </div>
      <form onSubmit={handleRegister} className="card-flat p-6 space-y-4">
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
            placeholder="至少 6 位"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入密码"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            autoComplete="new-password"
          />
        </div>
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
        <button type="submit" className="btn-flat btn-primary w-full" disabled={loading}>
          {loading ? '注册中…' : '注册'}
        </button>
      </form>
      <p className="text-center text-sm text-[var(--color-text-muted)]">
        已有账号？
        <Link to="/login" className="text-[var(--color-primary)] hover:underline ml-1">
          去登录
        </Link>
        <span className="mx-2">|</span>
        <Link to="/" className="text-[var(--color-primary)] hover:underline">
          返回首页
        </Link>
      </p>
    </div>
  )
}
