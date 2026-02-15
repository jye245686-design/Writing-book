import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fetchWithRetry } from '../utils/fetchWithRetry'
import { getApiBase } from '../utils/api'
import type { CharacterItem } from './CreateCharacters'
import type { OutlineState } from './CreateOutline'

export interface SettingState {
  worldBackground: string
  /** 世界背景细分方向（如古风探案、朝堂权谋），选填 */
  worldBackgroundSub?: string
  genre: string
  coreIdea: string
  /** 可选标签（机制/时空/结构/风格/生活/情感/目标等），选填，用于增强生成 */
  optionalTags?: string[]
}

type TitlePageState = {
  setting?: SettingState
  title?: string
  oneLinePromise?: string
  characters?: CharacterItem[]
  outline?: OutlineState
  projectId?: string
} | null

export default function CreateTitle() {
  const location = useLocation()
  const navigate = useNavigate()
  const pageState = location.state as TitlePageState
  const setting = pageState?.setting

  const [title, setTitle] = useState(() => pageState?.title ?? '')
  const [oneLinePromise, setOneLinePromise] = useState(() => pageState?.oneLinePromise ?? '')
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<string[]>([])
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 无设定数据时返回创作设定页
  if (!setting) {
    return (
      <div className="space-y-6">
        <p className="text-[var(--color-text-muted)]">未获取到创作设定，请先完成设定。</p>
        <Link to="/create" className="btn-flat btn-primary">
          去设定
        </Link>
      </div>
    )
  }

  const apiBase = getApiBase()

  const handleSuggest = async () => {
    setLoading(true)
    setError(null)
    const previousCandidates = candidates
    try {
      const res = await fetchWithRetry(`${apiBase}/api/ai/titles/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldBackground: setting.worldBackground,
          worldBackgroundSub: setting.worldBackgroundSub || undefined,
          genre: setting.genre,
          coreIdea: setting.coreIdea || '',
          optionalTags: setting.optionalTags?.length ? setting.optionalTags : undefined,
          previousCandidates,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `请求失败: ${res.status}`)
      }
      const list = data.candidates
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('未返回有效书名，请重试')
      }
      setCandidates(list.slice(0, 3))
      setHasGeneratedOnce(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败，请重试'
      if (msg === 'Failed to fetch' || (e instanceof TypeError && msg.includes('fetch'))) {
        setError('无法连接后端服务。请先在另一终端执行：cd server && npm run start（默认端口 3002）。若端口被占用，可在 .env 中设置 PORT=其他端口 并同步修改 web/.env.development 的 VITE_API_BASE_URL。')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    navigate('/create/characters', {
      state: {
        setting,
        title: title.trim(),
        oneLinePromise: oneLinePromise.trim() || undefined,
        characters: pageState?.characters,
        outline: pageState?.outline,
        projectId: pageState?.projectId,
      },
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/create"
            state={{
              setting,
              title: pageState?.title ?? title,
              oneLinePromise: pageState?.oneLinePromise ?? oneLinePromise,
              characters: pageState?.characters,
              outline: pageState?.outline,
              projectId: pageState?.projectId,
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
          >
            ← 返回设定
          </Link>
          {pageState?.characters != null && pageState.characters.length > 0 && (
            <Link
              to="/create/characters"
              state={{
                setting,
                title: pageState?.title ?? title,
                oneLinePromise: pageState?.oneLinePromise ?? oneLinePromise,
                characters: pageState.characters,
                outline: pageState.outline,
                projectId: pageState.projectId,
              }}
              className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
            >
              返回角色 →
            </Link>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">生成书名</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          根据「{setting.worldBackground}{setting.worldBackgroundSub ? `（${setting.worldBackgroundSub}）` : ''} + {setting.genre}」{setting.coreIdea ? `及创意「${setting.coreIdea}」` : ''}生成候选书名，选择或输入后确定。
        </p>
      </div>

      <div className="card-flat p-6 space-y-6">
        <div>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="btn-flat btn-primary"
          >
            {loading ? '生成中…' : hasGeneratedOnce ? '重新生成书名' : '生成候选书名'}
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
          {candidates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTitle(c)}
                  className="rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-4 py-2 text-sm hover:bg-gray-50"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">书名</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="选择上方候选或直接输入"
              className="input-flat"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              全书一句话承诺 <span className="text-[var(--color-text-muted)] font-normal">（选填）</span>
            </label>
            <input
              type="text"
              value={oneLinePromise}
              onChange={(e) => setOneLinePromise(e.target.value)}
              placeholder="用于约束后续大纲与正文不跑题"
              className="input-flat"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-flat btn-primary" disabled={!title.trim()}>
              确定书名，下一步
            </button>
            <Link to="/create" className="btn-flat">
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
