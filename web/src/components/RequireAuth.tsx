import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * 未登录时重定向到登录页，登录后可跳回原页面（通过 state.returnTo）
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[var(--color-text-muted)]">加载中…</span>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" state={{ returnTo: location.pathname }} replace />
  }
  return <>{children}</>
}
