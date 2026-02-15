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
    <div className="space-y-10">
      <section className="text-center md:text-left">
        <h1 className="page-title text-3xl md:text-4xl text-gray-900 gradient-text">
          开始创作
        </h1>
        <p className="mt-3 text-base text-[var(--color-text-muted)] max-w-xl">
          选择世界背景与题材，由 AI 生成书名与大纲，按章节完成整本小说。
        </p>
      </section>

      {authLoading ? (
        <section className="card-flat p-8">
          <p className="text-sm text-[var(--color-text-muted)]">加载中…</p>
        </section>
      ) : !user ? (
        <section className="card-flat p-10 text-center">
          <p className="text-[var(--color-text-muted)] mb-6">
            登录后可查看「我的项目」并新建小说。
          </p>
          <Link to="/login" className="btn-flat btn-primary">
            登录 / 注册
          </Link>
        </section>
      ) : (
        <section className="card-flat p-8">
          <h2 className="page-title text-xl text-gray-900 mb-1">我的项目</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            继续写之前的书，或新建一本。
          </p>
          {loading ? (
            <p className="text-sm text-[var(--color-text-muted)] mb-6">加载中…</p>
          ) : listError ? (
            <p className="text-sm text-[var(--color-text-muted)] mb-6">{listError}</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] mb-6">暂无项目，请先新建小说。</p>
          ) : (
            <ul className="space-y-3 mb-6">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/create/writing/${p.id}`}
                    className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-5 py-4 text-left transition-all hover:border-[var(--color-primary)]/30 hover:shadow-md hover:bg-[var(--color-primary-light)]/20"
                  >
                    <span className="font-medium text-gray-900">{p.title || '未命名'}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">
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
