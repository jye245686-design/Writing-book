import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fetchWithRetry } from '../utils/fetchWithRetry'
import { apiUrl, getAuthHeaders } from '../utils/api'
import type { SettingState } from './CreateTitle'
import type { CharacterItem } from './CreateCharacters'

export interface OutlineChapter {
  chapterIndex: number
  title: string
  goal: string
  points: string[]
}

export interface OutlineState {
  totalChapters: number
  chapters: OutlineChapter[]
}

interface OutlineLocationState {
  setting: SettingState
  title: string
  oneLinePromise?: string
  characters?: CharacterItem[]
  outline?: OutlineState
  /** 从写作页返回时带入，用于显示「返回写作」 */
  projectId?: string
}

const BATCH_THRESHOLD = 12 // 超过此章节数时使用分批生成，避免单次请求过慢
const BATCH_SIZE = 10
const LARGE_CHAPTER_THRESHOLD = 100 // 超过此章数时：生成前二次确认、列表分页展示
const OUTLINE_PAGE_SIZE = 50

export default function CreateOutline() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as OutlineLocationState | null

  const [totalChapters, setTotalChapters] = useState(30)
  const [outline, setOutline] = useState<OutlineState | null>(() => (state as OutlineLocationState & { outline?: OutlineState })?.outline ?? null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outlinePage, setOutlinePage] = useState(0)

  if (!state) {
    return (
      <div className="space-y-6">
        <p className="text-[var(--color-text-muted)]">请先完成角色步骤。</p>
        <Link to="/create/characters" className="btn-flat btn-primary">
          去设定角色
        </Link>
      </div>
    )
  }

  const basePayload = {
      title: state.title,
      worldBackground: state.setting.worldBackground,
      genre: state.setting.genre,
      coreIdea: state.setting.coreIdea || '',
      oneLinePromise: state.oneLinePromise || '',
      totalChapters,
      characters: state.characters ?? [],
    }

  const handleGenerate = async () => {
    if (totalChapters > LARGE_CHAPTER_THRESHOLD) {
      const ok = window.confirm(
        `章节数较多（${totalChapters} 章），预计耗时较长（约 30 分钟～1 小时），请勿关闭页面。是否继续？`
      )
      if (!ok) return
    }
    setLoading(true)
    setError(null)
    setProgress(null)
    try {
      if (totalChapters <= BATCH_THRESHOLD) {
        const res = await fetchWithRetry(apiUrl('/api/ai/outline/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(basePayload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`)
        setOutline({ totalChapters: data.totalChapters, chapters: data.chapters || [] })
      } else {
        const accumulated: OutlineChapter[] = []
        for (let start = 1; start <= totalChapters; start += BATCH_SIZE) {
          const end = Math.min(start + BATCH_SIZE - 1, totalChapters)
          setProgress({ done: accumulated.length, total: totalChapters })
          const previousChapters = accumulated.slice(-5).map((ch) => ({
            chapterIndex: ch.chapterIndex,
            title: ch.title,
            goal: ch.goal,
          }))
          const res = await fetchWithRetry(apiUrl('/api/ai/outline/generate-batch'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...basePayload,
              startChapterIndex: start,
              endChapterIndex: end,
              previousChapters,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`)
          const batch = (data.chapters || []) as OutlineChapter[]
          accumulated.push(...batch)
          setOutline({ totalChapters, chapters: [...accumulated] })
          setProgress({ done: accumulated.length, total: totalChapters })
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成大纲失败，请重试')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const updateChapter = (index: number, field: keyof OutlineChapter, value: string | string[]) => {
    if (!outline) return
    const next = outline.chapters.map((ch) =>
      ch.chapterIndex === index ? { ...ch, [field]: value } : ch
    )
    setOutline({ ...outline, chapters: next })
  }

  const handleConfirm = async () => {
    if (!outline || outline.chapters.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithRetry(apiUrl('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          setting: state.setting,
          title: state.title,
          oneLinePromise: state.oneLinePromise ?? '',
          characters: state.characters ?? [],
          outline: { totalChapters: outline.totalChapters, chapters: outline.chapters },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`)
      const projectId = data.id
      if (!projectId) throw new Error('未返回项目 ID')
      navigate(`/create/writing/${projectId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建项目失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const projectId = state.projectId

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/create/characters"
            state={{
              setting: state.setting,
              title: state.title,
              oneLinePromise: state.oneLinePromise,
              characters: state.characters,
              outline: outline ?? state.outline ?? undefined,
              projectId,
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
          >
            ← 返回角色
          </Link>
          {projectId && (
            <Link
              to={`/create/writing/${projectId}`}
              className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
            >
              返回写作 →
            </Link>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">生成大纲</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          书名：「{state.title}」。根据书名与设定生成章节大纲，可编辑后确认。
        </p>
      </div>

      <div className="card-flat p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">章节数</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={totalChapters}
              onChange={(e) => setTotalChapters(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
              className="input-flat w-24"
            />
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="btn-flat btn-primary"
          >
            {loading ? '生成中…' : outline ? '重新生成大纲' : '生成大纲'}
          </button>
        </div>
        {loading && progress && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-text-muted)]">
              正在生成大纲… 已生成 {progress.done} / {progress.total} 章
            </p>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] transition-all duration-300"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {outline && outline.chapters.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-gray-900">大纲（可编辑）</h2>
          {outline.chapters.length > LARGE_CHAPTER_THRESHOLD && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <button
                type="button"
                onClick={() => setOutlinePage((p) => Math.max(0, p - 1))}
                disabled={outlinePage === 0}
                className="btn-flat text-sm"
              >
                上一页
              </button>
              <span>
                第 {outlinePage + 1} 页 / 共 {Math.ceil(outline.chapters.length / OUTLINE_PAGE_SIZE)} 页
                （第 {(outlinePage * OUTLINE_PAGE_SIZE) + 1}–{Math.min((outlinePage + 1) * OUTLINE_PAGE_SIZE, outline.chapters.length)} 章）
              </span>
              <button
                type="button"
                onClick={() => setOutlinePage((p) => Math.min(Math.ceil(outline.chapters.length / OUTLINE_PAGE_SIZE) - 1, p + 1))}
                disabled={outlinePage >= Math.ceil(outline.chapters.length / OUTLINE_PAGE_SIZE) - 1}
                className="btn-flat text-sm"
              >
                下一页
              </button>
            </div>
          )}
          <div className="space-y-4">
            {(outline.chapters.length > LARGE_CHAPTER_THRESHOLD
              ? outline.chapters.slice(outlinePage * OUTLINE_PAGE_SIZE, (outlinePage + 1) * OUTLINE_PAGE_SIZE)
              : outline.chapters
            ).map((ch) => (
              <div key={ch.chapterIndex} className="card-flat p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                  第 {ch.chapterIndex} 章
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">章标题</label>
                  <input
                    value={ch.title}
                    onChange={(e) => updateChapter(ch.chapterIndex, 'title', e.target.value)}
                    className="input-flat text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">本章目标</label>
                  <input
                    value={ch.goal}
                    onChange={(e) => updateChapter(ch.chapterIndex, 'goal', e.target.value)}
                    className="input-flat text-sm"
                    placeholder="一句话目标"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">关键要点（每行一条）</label>
                  <textarea
                    value={(ch.points || []).join('\n')}
                    onChange={(e) =>
                      updateChapter(
                        ch.chapterIndex,
                        'points',
                        e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                      )
                    }
                    className="input-flat text-sm min-h-[80px]"
                    placeholder="要点1&#10;要点2&#10;要点3"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={handleConfirm} disabled={loading} className="btn-flat btn-primary">
              确认大纲，下一步
            </button>
            <button type="button" onClick={handleGenerate} disabled={loading} className="btn-flat">
              重新生成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
