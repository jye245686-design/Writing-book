import { useState, useCallback, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchWithRetry } from '../utils/fetchWithRetry'
import { getApiBase, getAuthHeaders } from '../utils/api'
import type { SettingState } from './CreateTitle'
import type { CharacterItem } from './CreateCharacters'
import type { OutlineState, OutlineChapter } from './CreateOutline'

interface GeneratedChapter {
  content: string
  wordCount: number
  status: 'draft' | 'locked'
}

interface ConsistencyIssue {
  type: string
  severity: string
  chapterIndex: number
  message: string
  suggestion?: string
}

interface ConsistencyReport {
  projectId: string
  checkedAt: string
  issues: ConsistencyIssue[]
  status: string
  /** 当全书章数超过 150 时，仅检查最近一段，此处为检查范围 */
  checkedChaptersRange?: { from: number; to: number; total: number }
}

interface ProjectPayload {
  id: string
  setting: SettingState
  title: string
  oneLinePromise?: string
  characters?: CharacterItem[]
  outline: OutlineState
  chapters?: Record<string, { content: string; wordCount: number; status: string }>
  consistencyReport?: ConsistencyReport
}

const apiBase = getApiBase()
const LARGE_CHAPTER_THRESHOLD = 100 // 超过此章数时：章节列表折叠，仅展开当前章
const WRITING_LIST_PAGE_SIZE = 50

export default function CreateWriting() {
  const { projectId } = useParams<{ projectId?: string }>()

  const [project, setProject] = useState<ProjectPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!projectId)
  const [chapterWordCounts, setChapterWordCounts] = useState<Record<number, number>>({})
  const [generatingChapter, setGeneratingChapter] = useState<number | null>(null)
  const [savingChapter, setSavingChapter] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [consistencyLoading, setConsistencyLoading] = useState(false)
  const [consistencyError, setConsistencyError] = useState<string | null>(null)
  const [exportScope, setExportScope] = useState<'all' | 'locked'>('locked')
  const [selectedExportChapters, setSelectedExportChapters] = useState<number[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  /** 章数 > 100 时，仅展开当前选中的章；null 表示未选或未进入大章数模式 */
  const [expandedChapterIndex, setExpandedChapterIndex] = useState<number | null>(null)
  /** 章数 > 100 时，章节索引列表的当前页（0 起算） */
  const [writingListPage, setWritingListPage] = useState(0)

  useEffect(() => {
    if (!successMessage) return
    const t = setTimeout(() => setSuccessMessage(null), 3000)
    return () => clearTimeout(t)
  }, [successMessage])

  const setApiError = useCallback((e: unknown, fallback: string) => {
    const msg = e instanceof Error ? e.message : fallback
    setError(msg === 'Failed to fetch' || /网络|连接|timeout|加载失败/i.test(msg) ? '网络异常，请稍后重试' : msg)
  }, [])

  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    fetchWithRetry(`${apiBase}/api/projects/${projectId}`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? '项目不存在' : `请求失败: ${res.status}`)
        return res.json()
      })
      .then((data: ProjectPayload) => {
        setProject(data)
        const counts: Record<number, number> = {}
        const ch = data.chapters ?? {}
        Object.keys(ch).forEach((k) => {
          const i = Number(k)
          if (Number.isInteger(i) && ch[k].wordCount) counts[i] = ch[k].wordCount
        })
        setChapterWordCounts(counts)
        const locked = Object.entries(ch)
          .filter(([, v]) => v.status === 'locked')
          .map(([k]) => Number(k))
          .filter((n) => Number.isInteger(n))
          .sort((a, b) => a - b)
        setSelectedExportChapters(locked)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : '加载项目失败'))
      .finally(() => setLoading(false))
  }, [projectId])

  const getWordCountForChapter = useCallback(
    (chapterIndex: number) => chapterWordCounts[chapterIndex] ?? 3000,
    [chapterWordCounts]
  )
  const setWordCountForChapter = useCallback((chapterIndex: number, value: number) => {
    setChapterWordCounts((prev) => ({ ...prev, [chapterIndex]: Math.min(8000, Math.max(500, value)) }))
  }, [])

  const generatedChapters: Record<number, GeneratedChapter> = {}
  if (project?.chapters) {
    Object.entries(project.chapters).forEach(([k, v]) => {
      const i = Number(k)
      if (Number.isInteger(i))
        generatedChapters[i] = {
          content: v.content,
          wordCount: v.wordCount,
          status: (v.status === 'locked' ? 'locked' : 'draft') as 'draft' | 'locked',
        }
    })
  }

  const updateChapterContentLocal = useCallback((chapterIndex: number, content: string) => {
    setProject((prev) => {
      if (!prev) return prev
      const ch = prev.chapters?.[String(chapterIndex)]
      if (!ch || ch.status === 'locked') return prev
      return {
        ...prev,
        chapters: {
          ...prev.chapters,
          [String(chapterIndex)]: { ...ch, content },
        },
      }
    })
  }, [])

  const saveChapterContent = useCallback(
    async (chapterIndex: number) => {
      if (!projectId || !project?.chapters?.[String(chapterIndex)]) return
      const ch = project.chapters[String(chapterIndex)]
      if (ch.status === 'locked') return
      setSavingChapter(chapterIndex)
      setError(null)
      try {
        const res = await fetchWithRetry(`${apiBase}/api/projects/${projectId}/chapters/${chapterIndex}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ content: ch.content }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `保存失败: ${res.status}`)
        setSuccessMessage('已保存')
      } catch (e) {
        setApiError(e, '保存失败')
      } finally {
        setSavingChapter(null)
      }
    },
    [projectId, project?.chapters, setApiError]
  )

  const runConsistencyCheck = useCallback(async () => {
    if (!projectId) return
    setConsistencyLoading(true)
    setConsistencyError(null)
    try {
      const res = await fetchWithRetry(`${apiBase}/api/projects/${projectId}/consistency/run`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`)
      setProject((prev) => (prev ? { ...prev, consistencyReport: data } : prev))
      setSuccessMessage('一致性检查完成')
    } catch (e) {
      setConsistencyError(e instanceof Error ? e.message : '一致性检查失败')
      if (e instanceof Error && (e.message === 'Failed to fetch' || /网络|连接/i.test(e.message))) {
        setConsistencyError('网络异常，请稍后重试')
      }
    } finally {
      setConsistencyLoading(false)
    }
  }, [projectId])

  const lockedChaptersList = project
    ? (project.outline?.chapters ?? [])
        .filter((ch) => project.chapters?.[String(ch.chapterIndex)]?.status === 'locked')
        .sort((a, b) => a.chapterIndex - b.chapterIndex)
    : []
  const chaptersWithContentCount = project
    ? Object.values(project.chapters || {}).filter((ch) => ch.content).length
    : 0
  const canExportAll = !!projectId && chaptersWithContentCount > 0
  const canExportLocked = !!projectId && selectedExportChapters.length > 0
  const canExport = exportScope === 'all' ? canExportAll : canExportLocked

  const toggleExportChapter = useCallback((chapterIndex: number, checked: boolean) => {
    setSelectedExportChapters((prev) =>
      checked ? [...prev, chapterIndex].sort((a, b) => a - b) : prev.filter((n) => n !== chapterIndex)
    )
  }, [])

  const handleExportTxt = useCallback(async () => {
    if (!projectId || !canExport) return
    setError(null)
    try {
      const base = apiBase || (typeof window !== 'undefined' ? window.location.origin : '')
      let url = `${base}/api/projects/${projectId}/export?format=txt&scope=${exportScope}`
      if (exportScope === 'locked' && selectedExportChapters.length > 0) {
        url += `&chapters=${selectedExportChapters.join(',')}`
      }
      const res = await fetch(url, { headers: getAuthHeaders() })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `导出失败: ${res.status}`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i) || disposition?.match(/filename="?([^";\n]+)"?/i)
      const filename = match ? decodeURIComponent(match[1].trim()) : `${project?.title || 'book'}.txt`
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)
      setSuccessMessage('已导出，请查看下载')
    } catch (e) {
      setApiError(e, '导出失败')
    }
  }, [projectId, canExport, project?.title, exportScope, selectedExportChapters, setApiError])

  const scrollToChapter = useCallback((chapterIndex: number) => {
    const outline = project?.outline
    const chapters = outline?.chapters ?? []
    if (chapters.length > LARGE_CHAPTER_THRESHOLD) {
      setExpandedChapterIndex(chapterIndex)
      setWritingListPage(Math.floor(chapters.findIndex((c) => c.chapterIndex === chapterIndex) / WRITING_LIST_PAGE_SIZE))
    }
    document.getElementById(`chapter-${chapterIndex}`)?.scrollIntoView({ behavior: 'smooth' })
  }, [project?.outline?.chapters])

  const lockChapter = useCallback(
    async (chapterIndex: number) => {
      if (!projectId || !project?.chapters?.[String(chapterIndex)]) return
      const ch = project.chapters[String(chapterIndex)]
      setSavingChapter(chapterIndex)
      setError(null)
      try {
        const res = await fetchWithRetry(`${apiBase}/api/projects/${projectId}/chapters/${chapterIndex}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ content: ch.content, status: 'locked' }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `锁定失败: ${res.status}`)
        setProject((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            chapters: {
              ...prev.chapters,
              [String(chapterIndex)]: { ...ch, status: 'locked' },
            },
          }
        })
        setSelectedExportChapters((prev) =>
          prev.includes(chapterIndex) ? prev : [...prev, chapterIndex].sort((a, b) => a - b)
        )
        setSuccessMessage('已锁定')
      } catch (e) {
        setApiError(e, '锁定失败')
      } finally {
        setSavingChapter(null)
      }
    },
    [projectId, project?.chapters, setApiError]
  )

  const handleGenerate = useCallback(
    async (ch: OutlineChapter) => {
      if (!projectId) return
      const chapterIndex = ch.chapterIndex
      setGeneratingChapter(chapterIndex)
      setError(null)
      try {
        const wordCount = getWordCountForChapter(chapterIndex)
        const res = await fetchWithRetry(
          `${apiBase}/api/projects/${projectId}/chapters/${chapterIndex}/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ wordCount }),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`)
        const content = data.content ?? ''
        setProject((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            chapters: {
              ...prev.chapters,
              [String(chapterIndex)]: { content, wordCount, status: 'draft' },
            },
          }
        })
        setChapterWordCounts((prev) => ({ ...prev, [chapterIndex]: wordCount }))
      } catch (e) {
        setApiError(e, '生成本章失败，请重试')
      } finally {
        setGeneratingChapter(null)
      }
    },
    [projectId, getWordCountForChapter, setApiError]
  )

  if (!projectId) {
    return (
      <div className="space-y-6">
        <p className="text-[var(--color-text-muted)]">请先完成大纲并确认，将自动创建项目并进入写作页。</p>
        <Link to="/create/outline" className="btn-flat btn-primary">
          去生成大纲
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-text-muted)]">
        加载项目中…
      </div>
    )
  }

  if (loadError || !project) {
    return (
      <div className="space-y-6">
        <p className="text-red-600">{loadError ?? '项目不存在'}</p>
        <Link to="/create/outline" className="btn-flat btn-primary">
          去生成大纲
        </Link>
      </div>
    )
  }

  const outline = project.outline
  const chapters = outline?.chapters ?? []
  const isLargeChapterCount = chapters.length > LARGE_CHAPTER_THRESHOLD
  const expandedChapter =
    isLargeChapterCount && expandedChapterIndex != null
      ? chapters.find((c) => c.chapterIndex === expandedChapterIndex) ?? null
      : null
  const chaptersToRender =
    isLargeChapterCount && expandedChapter ? [expandedChapter] : isLargeChapterCount ? [] : chapters
  const writingListTotalPages = Math.ceil(chapters.length / WRITING_LIST_PAGE_SIZE)
  const writingListChunk =
    isLargeChapterCount && writingListTotalPages > 0
      ? chapters.slice(
          writingListPage * WRITING_LIST_PAGE_SIZE,
          (writingListPage + 1) * WRITING_LIST_PAGE_SIZE
        )
      : []

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/create/outline"
            state={{
              setting: project.setting,
              title: project.title,
              oneLinePromise: project.oneLinePromise,
              characters: project.characters,
              outline: project.outline,
              projectId: project.id,
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
          >
            ← 返回大纲
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">按章生成正文</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          书名：「{project.title}」。按顺序生成各章正文，可重写或锁定后继续下一章。数据已持久化，刷新不丢失。
        </p>
      </div>

      {successMessage && (
        <div className="card-flat border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="card-flat border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      <section className="card-flat p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-700">一致性检查</span>
        <button
          type="button"
          onClick={runConsistencyCheck}
          disabled={consistencyLoading || !Object.keys(project.chapters || {}).length}
          className="btn-flat btn-primary text-sm"
        >
          {consistencyLoading ? '检查中…' : '发起检查'}
        </button>
        {consistencyError && (
          <span className="text-sm text-red-600">{consistencyError}</span>
        )}
        {project.consistencyReport && (
          <span className="text-xs text-[var(--color-text-muted)]">
            上次检查：{new Date(project.consistencyReport.checkedAt).toLocaleString()}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-sm font-medium text-gray-700">导出</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="exportScope"
            checked={exportScope === 'all'}
            onChange={() => setExportScope('all')}
            className="rounded-full"
          />
          全部有正文的章节
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="exportScope"
            checked={exportScope === 'locked'}
            onChange={() => setExportScope('locked')}
            className="rounded-full"
          />
          仅已锁定章节
        </label>
        <button
          type="button"
          onClick={handleExportTxt}
          disabled={!canExport}
          title={canExport ? '导出为 TXT' : exportScope === 'all' ? '请先生成章节' : '请锁定并勾选要导出的章节'}
          className="btn-flat btn-primary text-sm"
        >
          导出 TXT
        </button>
      </section>

      {exportScope === 'locked' && lockedChaptersList.length > 0 && (
        <section className="card-flat p-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">选择要导出的已锁定章节（可多选，方便上传书城）</p>
          <div className="flex flex-wrap gap-3">
            {lockedChaptersList.map((ch) => (
              <label key={ch.chapterIndex} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedExportChapters.includes(ch.chapterIndex)}
                  onChange={(e) => toggleExportChapter(ch.chapterIndex, e.target.checked)}
                  className="rounded"
                />
                第 {ch.chapterIndex} 章 {ch.title}
              </label>
            ))}
          </div>
        </section>
      )}

      {project.consistencyReport && project.consistencyReport.issues.length > 0 && (
        <section className="card-flat p-4 space-y-3">
          <h2 className="text-lg font-medium text-gray-900">一致性报告（共 {project.consistencyReport.issues.length} 项）</h2>
          {project.consistencyReport.checkedChaptersRange && (
            <p className="text-xs text-[var(--color-text-muted)]">
              本次检查第 {project.consistencyReport.checkedChaptersRange.from}–{project.consistencyReport.checkedChaptersRange.to} 章，全书共 {project.consistencyReport.checkedChaptersRange.total} 章
            </p>
          )}
          <ul className="space-y-2">
            {project.consistencyReport.issues.map((issue, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 text-sm">
                <span
                  className={
                    issue.severity === 'error'
                      ? 'rounded bg-red-100 px-1.5 py-0.5 text-red-800'
                      : 'rounded bg-amber-100 px-1.5 py-0.5 text-amber-800'
                  }
                >
                  {issue.severity === 'error' ? '错误' : '警告'}
                </span>
                <span className="text-[var(--color-text-muted)]">
                  {issue.type === 'timeline' ? '时间线' : issue.type === 'character' ? '人物' : '大纲偏离'}
                </span>
                <button
                  type="button"
                  onClick={() => scrollToChapter(issue.chapterIndex)}
                  className="text-blue-600 hover:underline"
                >
                  第 {issue.chapterIndex} 章
                </button>
                <span className="flex-1">{issue.message}</span>
                {issue.suggestion && (
                  <span className="block w-full text-[var(--color-text-muted)] mt-1">
                    建议：{issue.suggestion}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {project.consistencyReport && project.consistencyReport.issues.length === 0 && project.consistencyReport.status === 'completed' && (
        <p className="text-sm text-[var(--color-text-muted)]">
          一致性检查通过，未发现明显问题。
          {project.consistencyReport.checkedChaptersRange && (
            <span className="block mt-1">
              （本次检查第 {project.consistencyReport.checkedChaptersRange.from}–{project.consistencyReport.checkedChaptersRange.to} 章，全书共 {project.consistencyReport.checkedChaptersRange.total} 章）
            </span>
          )}
        </p>
      )}

      <div className="space-y-6">
        {isLargeChapterCount && (
          <section className="card-flat p-4 space-y-3">
            <h2 className="text-sm font-medium text-gray-700">章节列表（共 {chapters.length} 章，点击展开）</h2>
            {writingListTotalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setWritingListPage((p) => Math.max(0, p - 1))}
                  disabled={writingListPage === 0}
                  className="btn-flat text-sm"
                >
                  上一页
                </button>
                <span className="text-[var(--color-text-muted)]">
                  第 {writingListPage + 1} / {writingListTotalPages} 页
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setWritingListPage((p) => Math.min(writingListTotalPages - 1, p + 1))
                  }
                  disabled={writingListPage >= writingListTotalPages - 1}
                  className="btn-flat text-sm"
                >
                  下一页
                </button>
              </div>
            )}
            <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {writingListChunk.map((ch) => {
                const gen = generatedChapters[ch.chapterIndex]
                const isActive = expandedChapterIndex === ch.chapterIndex
                return (
                  <li key={ch.chapterIndex}>
                    <button
                      type="button"
                      onClick={() => setExpandedChapterIndex(ch.chapterIndex)}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm truncate ${
                        isActive
                          ? 'bg-[var(--color-primary)] text-white'
                          : 'hover:bg-gray-100 text-gray-800'
                      }`}
                    >
                      第 {ch.chapterIndex} 章 {ch.title}
                      {gen?.status === 'locked' && ' · 已锁定'}
                    </button>
                  </li>
                )
              })}
            </ul>
            {expandedChapterIndex == null && (
              <p className="text-sm text-[var(--color-text-muted)]">请从上方列表选择一章以编辑或生成正文。</p>
            )}
          </section>
        )}

        {chaptersToRender.length === 0 && !isLargeChapterCount && null}
        {chaptersToRender.length === 0 && isLargeChapterCount && expandedChapterIndex == null && null}
        {chaptersToRender.map((ch) => {
          const gen = generatedChapters[ch.chapterIndex]
          const isGenerating = generatingChapter === ch.chapterIndex
          const isSaving = savingChapter === ch.chapterIndex
          const isLocked = gen?.status === 'locked'
          const canGenerate = !isGenerating
          const hasContent = !!gen?.content

          return (
            <section
              key={ch.chapterIndex}
              id={`chapter-${ch.chapterIndex}`}
              className="card-flat p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-medium text-gray-900">
                  第 {ch.chapterIndex} 章：{ch.title}
                </h2>
                {gen?.status === 'locked' && (
                  <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                    已锁定
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                <span className="font-medium">目标：</span>
                {ch.goal}
              </p>
              {Array.isArray(ch.points) && ch.points.length > 0 && (
                <ul className="list-inside list-disc text-sm text-[var(--color-text-muted)]">
                  {ch.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--color-text-muted)]">本章字数：</span>
                  <input
                    type="number"
                    min={500}
                    max={8000}
                    step={500}
                    value={getWordCountForChapter(ch.chapterIndex)}
                    onChange={(e) =>
                      setWordCountForChapter(ch.chapterIndex, e.target.valueAsNumber || 3000)
                    }
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handleGenerate(ch)}
                  disabled={!canGenerate}
                  className="btn-flat btn-primary text-sm"
                >
                  {isGenerating ? '生成中…' : hasContent ? '重写本章' : '生成本章'}
                </button>
                {hasContent && !isLocked && (
                  <>
                    <button
                      type="button"
                      onClick={() => saveChapterContent(ch.chapterIndex)}
                      disabled={isSaving}
                      className="btn-flat text-sm"
                    >
                      {isSaving ? '保存中…' : '保存'}
                    </button>
                    <button
                      type="button"
                      onClick={() => lockChapter(ch.chapterIndex)}
                      disabled={isSaving}
                      className="btn-flat text-sm"
                    >
                      锁定本章
                    </button>
                  </>
                )}
              </div>

              {hasContent && gen && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">正文</label>
                  <textarea
                    value={gen.content}
                    onChange={(e) => updateChapterContentLocal(ch.chapterIndex, e.target.value)}
                    onBlur={() => !isLocked && saveChapterContent(ch.chapterIndex)}
                    readOnly={isLocked}
                    rows={14}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-sans text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-600"
                    placeholder="生成本章后正文将显示在这里，可编辑。锁定后仅可查看。"
                  />
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    约 {gen.content.length} 字
                    {isLocked
                      ? ' · 已锁定，仅可手动复制修改'
                      : ' · 可编辑；失焦自动保存；锁定后不再参与重写'}
                  </p>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
