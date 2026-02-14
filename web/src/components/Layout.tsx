import { Link, Outlet } from 'react-router-dom'
import { useAuth, maskPhone } from '../contexts/AuthContext'

export default function Layout() {
  const { user, loading, logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <a href="/" className="text-lg font-medium text-gray-900">
            AI 小说生成
          </a>
          <div className="flex items-center gap-3">
            {loading ? (
              <span className="text-sm text-[var(--color-text-muted)]">加载中…</span>
            ) : user ? (
              <>
                <span className="text-sm text-gray-600" title={user.phone}>
                  {maskPhone(user.phone)}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
                >
                  退出
                </button>
              </>
            ) : (
              <Link to="/login" className="text-sm text-[var(--color-text-muted)] hover:text-gray-900">
                登录 / 注册
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
