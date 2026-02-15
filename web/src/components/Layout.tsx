import { Link, Outlet } from 'react-router-dom'
import { useAuth, displayName } from '../contexts/AuthContext'

export default function Layout() {
  const { user, loading, logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2 text-xl font-semibold">
            <span className="gradient-text font-serif tracking-tight">AI 小说生成</span>
          </a>
          <div className="flex items-center gap-4">
            {loading ? (
              <span className="text-sm text-[var(--color-text-muted)]">加载中…</span>
            ) : user ? (
              <>
                <span className="text-sm text-gray-600" title={user.userId || user.phone || ''}>
                  {displayName(user)}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                >
                  退出
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-[var(--radius)] bg-gradient-to-r from-[var(--color-primary)] to-[#7c3aed] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-btn)] transition-all hover:opacity-95 hover:shadow-md"
              >
                登录 / 注册
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10">
        <Outlet />
      </main>
    </div>
  )
}
