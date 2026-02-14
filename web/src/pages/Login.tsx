import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getApiBase } from '../utils/api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string })?.returnTo || '/'
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const base = getApiBase() || (typeof window !== 'undefined' ? window.location.origin : '')

  const handleSendCode = async (e: React.MouseEvent) => {
    e.preventDefault()
    const trimmed = phone.replace(/\s/g, '')
    if (!trimmed) {
      setMessage({ type: 'error', text: '请输入手机号' })
      return
    }
    setSendLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`${base}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '发送失败' })
        return
      }
      setMessage({ type: 'success', text: '验证码已发送（开发环境请查看后端控制台）' })
    } catch {
      setMessage({ type: 'error', text: '网络异常，请稍后重试' })
    } finally {
      setSendLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedPhone = phone.replace(/\s/g, '')
    if (!trimmedPhone || !code.trim()) {
      setMessage({ type: 'error', text: '请输入手机号和验证码' })
      return
    }
    setLoginLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmedPhone, code: code.trim() }),
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
        <h1 className="text-2xl font-semibold text-gray-900">登录 / 注册</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          使用手机号接收验证码，验证即登录；未注册将自动创建账号。
        </p>
      </div>
      <form onSubmit={handleLogin} className="card-flat p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="请输入手机号"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            maxLength={11}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="验证码"
            className="flex-1 rounded border border-[var(--color-border)] px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            maxLength={6}
          />
          <button
            type="button"
            onClick={handleSendCode}
            disabled={sendLoading}
            className="btn-flat whitespace-nowrap"
          >
            {sendLoading ? '发送中…' : '获取验证码'}
          </button>
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
