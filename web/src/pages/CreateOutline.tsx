import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
const PREVIOUS_CHAPTERS_FOR_CONTINUITY = 15 // 继续生成时传入前文大纲的章数，保持一致性
const LARGE_CHAPTER_THRESHOLD = 100 // 超过此章数时：生成前二次确认、列表分页展示
const OUTLINE_PAGE_SIZE = 50

export default function CreateOutline() {
  const location = useLocation()
  const navigate = useNavigate()
  const { projectId: projectIdParam } = useParams()
  const projectIdFromUrl = projectIdParam ?? null
  const locationState = location.state as OutlineLocationState | null

  const [resolvedState, setResolvedState] = useState<OutlineLocationState | null>(() => locationState)
  const [loadingProject, setLoadingProject] = useState(!!projectIdFromUrl && !locationState?.setting)
  const state = resolvedState ?? locationState

  const [totalChapters, setTotalChapters] = useState(30)
  const [outline, setOutline] = useState<OutlineState | null>(() => (state as OutlineLocationState & { outline?: OutlineState })?.outline ?? null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outlinePage, setOutlinePage] = useState(0)
  const saveOutlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectId = projectIdFromUrl || state?.projectId

  // 从 URL projectId 加载项目（如刷新或从「我的项目」进入）
  useEffect(() => {
    if (!projectIdFromUrl || locationState?.setting) {
      if (projectIdFromUrl && locationState?.setting) setLoadingProject(false)
      return
    }
    let cancelled = false
    fetchWithRetry(apiUrl(`/api/projects/${projectIdFromUrl}`), { headers: getAuthHeaders() })
      .then((res) => {
        if (cancelled || !res.ok) return res.ok ? res.json() : null
        return res.json()
      })
      .then((data) => {
        if (cancelled || !data) return
        setResolvedState({
          setting: data.setting ?? { worldBackground: '', genre: '', coreIdea: '' },
          title: data.title ?? '',
          oneLinePromise: data.oneLinePromise ?? '',
          characters: data.characters ?? [],
          outline: data.outline?.chapters?.length ? data.outline : undefined,
          projectId: data.id,
        })
        if (data.outline?.chapters?.length) {
          setOutline(data.outline)
          setTotalChapters(data.outline.totalChapters ?? data.outline.chapters.length)
        } else if (data.outline?.totalChapters) {
          setTotalChapters(data.outline.totalChapters)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingProject(false)
      })
    return () => { cancelled = true }
  }, [projectIdFromUrl, locationState?.setting])

  // 若 state 中已有 projectId 但 URL 没有，则同步到 URL（便于刷新后仍能加载）
  useEffect(() => {
    if (state?.projectId && !projectIdFromUrl) {
      navigate(`/create/outline/${state.projectId}`, { replace: true, state })
      return
    }
  }, [state?.projectId, projectIdFromUrl, navigate, state])

  // 进入大纲页时若无项目则创建草稿并跳转到带 projectId 的 URL，便于保存与中途离开后继续
  useEffect(() => {
    if (!state?.setting || projectIdFromUrl || state.projectId) return
    let cancelled = false
    setLoadingProject(true)
    fetchWithRetry(apiUrl('/api/projects'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        setting: state.setting,
        title: state.title,
        oneLinePromise: state.oneLinePromise ?? '',
        characters: state.characters ?? [],
        outline: { totalChapters, chapters: [] },
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.id) return
        const id = data.id
        setResolvedState((prev) => (prev ? { ...prev, projectId: id } : prev))
        navigate(`/create/outline/${id}`, { replace: true, state: { ...state, projectId: id } })
      })
      .catch(() => setError('创建项目失败，请重试'))
      .finally(() => {
        if (!cancelled) setLoadingProject(false)
      })
    return () => { cancelled = true }
  }, [state?.setting, state?.title, state?.oneLinePromise, state?.characters, projectIdFromUrl, state?.projectId])

  if (loadingProject && !state) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-text-muted)]">
        加载项目中…
      </div>
    )
  }

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
      worldBackgroundSub: state.setting.worldBackgroundSub || undefined,
      genre: state.setting.genre,
      coreIdea: state.setting.coreIdea || '',
      oneLinePromise: state.oneLinePromise || '',
      optionalTags: state.setting.optionalTags?.length ? state.setting.optionalTags : undefined,
      totalChapters,
      characters: state.characters ?? [],
    }

  /** 执行分批生成：从 initialAccumulated 之后继续，直到 totalChapters；失败时保留已生成部分并抛错 */
  const runBatchGeneration = async (initialAccumulated: OutlineChapter[]) => {
    const accumulated = [...initialAccumulated]
    for (let start = accumulated.length + 1; start <= totalChapters; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, totalChapters)
      setProgress({ done: accumulated.length, total: totalChapters })
      const previousChapters = accumulated.slice(-PREVIOUS_CHAPTERS_FOR_CONTINUITY).map((ch) => ({
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
      const newOutline = { totalChapters, chapters: [...accumulated] }
      setOutline(newOutline)
      if (projectId) saveOutlineToProject(projectId, newOutline)
      setProgress({ done: accumulated.length, total: totalChapters })
    }
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
        const newOutline = { totalChapters: data.totalChapters, chapters: data.chapters || [] }
        setOutline(newOutline)
        if (projectId) saveOutlineToProject(projectId, newOutline)
      } else {
        await runBatchGeneration([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成大纲失败，请重试')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  /** 失败后点击「重试继续」：基于当前已生成的大纲与设定，从下一批继续生成 */
  const handleRetryContinue = async () => {
    if (!outline || outline.chapters.length >= totalChapters) return
    setLoading(true)
    setError(null)
    setProgress(null)
    try {
      await runBatchGeneration(outline.chapters)
    } catch (e) {
      setError(e instanceof Error ? e.message : '继续生成失败，可再次点击重试继续')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const saveOutlineToProject = useCallback(
    (pid: string, outlineData: OutlineState) => {
      fetchWithRetry(apiUrl(`/api/projects/${pid}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          outline: { totalChapters: outlineData.totalChapters, chapters: outlineData.chapters },
        }),
      }).catch(() => {})
    },
    []
  )

  const updateChapter = (index: number, field: keyof OutlineChapter, value: string | string[]) => {
    if (!outline) return
    const next = outline.chapters.map((ch) =>
      ch.chapterIndex === index ? { ...ch, [field]: value } : ch
    )
    const nextOutline = { ...outline, chapters: next }
    setOutline(nextOutline)
    if (projectId) {
      if (saveOutlineTimerRef.current) clearTimeout(saveOutlineTimerRef.current)
      saveOutlineTimerRef.current = setTimeout(() => {
        saveOutlineTimerRef.current = null
        saveOutlineToProject(projectId, nextOutline)
      }, 800)
    }
  }

  const handleConfirm = () => {
    if (!outline || outline.chapters.length === 0) return
    if (projectId) {
      navigate(`/create/writing/${projectId}`)
    } else {
      setError('项目未就绪，请稍候或刷新后重试')
    }
  }

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
        <h1 className="page-title mt-2 text-2xl font-semibold text-gray-900 gradient-text">生成大纲</h1>
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
        {error && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-red-600">{error}</p>
            {outline && outline.chapters.length > 0 && outline.chapters.length < totalChapters && (
              <button
                type="button"
                onClick={handleRetryContinue}
                disabled={loading}
                className="btn-flat btn-primary text-sm"
                title={`从第 ${outline.chapters.length + 1} 章起继续，将根据前 ${Math.min(PREVIOUS_CHAPTERS_FOR_CONTINUITY, outline.chapters.length)} 章大纲与设定续写`}
              >
                重试继续（已生成 {outline.chapters.length}/{totalChapters} 章）
              </button>
            )}
          </div>
        )}
      </div>

      {outline && outline.chapters.length > 0 && (
        <div className="space-y-4">
          <h2 className="page-title text-lg font-medium text-gray-900">大纲（可编辑）</h2>
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
