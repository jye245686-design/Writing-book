import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getApiBase, getAuthHeaders } from '../utils/api'
import { fetchWithRetry } from '../utils/fetchWithRetry'

interface ProjectItem {
  id: string
  title: string
  updatedAt: string
}

export default function Home() {
  const { user, loading: authLoading } = useAuth()
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    const apiBase = getApiBase()
    const base = apiBase || (typeof window !== 'undefined' ? window.location.origin : '')
    fetchWithRetry(`${base}/api/projects`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('获取列表失败')
        return res.json()
      })
      .then((data) => setProjects(data.projects || []))
      .catch(() => setListError('暂无项目或网络异常'))
      .finally(() => setLoading(false))
  }, [user])

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-gray-900">开始创作</h1>
        <p className="mt-2 text-[var(--color-text-muted)]">
          选择世界背景与题材，由 AI 生成书名与大纲，按章节完成整本小说。
        </p>
      </section>

      {authLoading ? (
        <section className="card-flat p-6">
          <p className="text-sm text-[var(--color-text-muted)]">加载中…</p>
        </section>
      ) : !user ? (
        <section className="card-flat p-6 text-center">
          <p className="text-[var(--color-text-muted)] mb-4">
            登录后可查看「我的项目」并新建小说。
          </p>
          <Link to="/login" className="btn-flat btn-primary">
            登录 / 注册
          </Link>
        </section>
      ) : (
        <section className="card-flat p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">我的项目</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            继续写之前的书，或新建一本。
          </p>
          {loading ? (
            <p className="text-sm text-[var(--color-text-muted)]">加载中…</p>
          ) : listError ? (
            <p className="text-sm text-[var(--color-text-muted)]">{listError}</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">暂无项目，请先新建小说。</p>
          ) : (
            <ul className="space-y-2 mb-4">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/create/writing/${p.id}`}
                    className="block rounded border border-[var(--color-border)] px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">{p.title || '未命名'}</span>
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/create" className="btn-flat btn-primary">
            新建小说
          </Link>
        </section>
      )}
    </div>
  )
}
