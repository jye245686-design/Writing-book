import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const WORLD_BACKGROUNDS = [
  { value: '古代', label: '古代' },
  { value: '末世', label: '末世' },
  { value: '星际', label: '星际' },
  { value: '现代', label: '现代' },
]

const GENRES = [
  { value: '玄幻', label: '玄幻' },
  { value: '言情', label: '言情' },
  { value: '悬疑', label: '悬疑' },
  { value: '都市', label: '都市' },
  { value: '科幻', label: '科幻' },
  { value: '武侠', label: '武侠' },
]

type CreateLocationState = {
  setting?: { worldBackground: string; genre: string; coreIdea: string }
  title?: string
  oneLinePromise?: string
  characters?: unknown[]
  outline?: unknown
  projectId?: string
} | null

export default function Create() {
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = location.state as CreateLocationState
  const [worldBackground, setWorldBackground] = useState(locationState?.setting?.worldBackground ?? '')
  const [genre, setGenre] = useState(locationState?.setting?.genre ?? '')
  const [coreIdea, setCoreIdea] = useState(locationState?.setting?.coreIdea ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const setting = { worldBackground, genre, coreIdea }
    navigate('/create/title', { state: { ...locationState, setting } })
  }

  const hasReturnToTitle = locationState?.title != null

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="text-sm text-[var(--color-text-muted)] hover:text-gray-900">
            ← 返回
          </a>
          {hasReturnToTitle && (
            <Link
              to="/create/title"
              state={locationState ?? undefined}
              className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
            >
              返回书名 →
            </Link>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">创作设定</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          选择世界背景与题材，可选填写核心创意，用于后续生成书名与大纲。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card-flat p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            世界背景
          </label>
          <div className="flex flex-wrap gap-2">
            {WORLD_BACKGROUNDS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setWorldBackground(opt.value)}
                className={
                  'rounded-[var(--radius)] border px-4 py-2 text-sm transition-colors ' +
                  (worldBackground === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : 'border-[var(--color-border)] bg-white text-gray-700 hover:bg-gray-50')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            题材
          </label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGenre(opt.value)}
                className={
                  'rounded-[var(--radius)] border px-4 py-2 text-sm transition-colors ' +
                  (genre === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : 'border-[var(--color-border)] bg-white text-gray-700 hover:bg-gray-50')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            核心创意 <span className="text-[var(--color-text-muted)] font-normal">（选填）</span>
          </label>
          <input
            type="text"
            value={coreIdea}
            onChange={(e) => setCoreIdea(e.target.value)}
            placeholder="例如：废柴逆袭 + 宗门争霸"
            className="input-flat"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-flat btn-primary" disabled={!worldBackground || !genre}>
            下一步：生成书名
          </button>
          <a href="/" className="btn-flat">
            取消
          </a>
        </div>
      </form>
    </div>
  )
}
