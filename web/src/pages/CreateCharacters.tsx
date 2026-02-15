import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { fetchWithRetry } from '../utils/fetchWithRetry'
import { getApiBase } from '../utils/api'
import type { SettingState } from './CreateTitle'
import type { OutlineState } from './CreateOutline'

const apiBase = getApiBase()

export interface CharacterItem {
  id: string
  name: string
  identity: string
  personality: string
  goal: string
  relationToProtagonist: string
  speechStyle: string
}

interface CharactersLocationState {
  setting: SettingState
  title: string
  oneLinePromise?: string
  characters?: CharacterItem[]
  outline?: OutlineState
  projectId?: string
}

const emptyCharacter = (): CharacterItem => ({
  id: crypto.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: '',
  identity: '',
  personality: '',
  goal: '',
  relationToProtagonist: '',
  speechStyle: '',
})

export default function CreateCharacters() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as CharactersLocationState | null

  const [characters, setCharacters] = useState<CharacterItem[]>(
    () => state?.characters?.length ? state.characters : [emptyCharacter()]
  )
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  if (!state) {
    return (
      <div className="space-y-6">
        <p className="text-[var(--color-text-muted)]">请先完成书名步骤。</p>
        <Link to="/create/title" className="btn-flat btn-primary">
          去生成书名
        </Link>
      </div>
    )
  }

  const addCharacter = () => {
    setCharacters((prev) => [...prev, emptyCharacter()])
  }

  const updateCharacter = (id: string, field: keyof CharacterItem, value: string) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  const removeCharacter = (id: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id))
  }

  const handleSuggest = async () => {
    setSuggestLoading(true)
    setSuggestError(null)
    try {
      const res = await fetchWithRetry(`${apiBase}/api/ai/characters/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          worldBackground: state.setting.worldBackground,
          worldBackgroundSub: state.setting.worldBackgroundSub || undefined,
          genre: state.setting.genre,
          coreIdea: state.setting.coreIdea || '',
          oneLinePromise: state.oneLinePromise || '',
          optionalTags: state.setting.optionalTags?.length ? state.setting.optionalTags : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`)
      const list = data.characters
      if (!Array.isArray(list) || list.length === 0) throw new Error('未返回有效角色')
      const withIds: CharacterItem[] = list.map((c: Record<string, string>) => ({
        id: crypto.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: String(c.name ?? '').trim(),
        identity: String(c.identity ?? '').trim(),
        personality: String(c.personality ?? '').trim(),
        goal: String(c.goal ?? '').trim(),
        relationToProtagonist: String(c.relationToProtagonist ?? '').trim(),
        speechStyle: String(c.speechStyle ?? '').trim(),
      }))
      setCharacters(withIds)
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : '推荐角色失败，请重试')
    } finally {
      setSuggestLoading(false)
    }
  }

  const handleConfirm = () => {
    const valid = characters.filter((c) => c.name.trim())
    if (valid.length === 0) return
    navigate('/create/outline', {
      state: {
        setting: state.setting,
        title: state.title,
        oneLinePromise: state.oneLinePromise,
        characters: valid,
      },
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/create/title"
            state={{
              setting: state.setting,
              title: state.title,
              oneLinePromise: state.oneLinePromise,
              characters: state.characters,
              outline: state.outline,
              projectId: state.projectId,
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
          >
            ← 返回书名
          </Link>
          {state.outline && (
            <Link
              to="/create/outline"
              state={{
                setting: state.setting,
                title: state.title,
                oneLinePromise: state.oneLinePromise,
                characters: state.characters,
                outline: state.outline,
                projectId: state.projectId,
              }}
              className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
            >
              返回大纲 →
            </Link>
          )}
          {state.projectId && (
            <Link
              to={`/create/writing/${state.projectId}`}
              className="text-sm text-[var(--color-text-muted)] hover:text-gray-900"
            >
              返回写作 →
            </Link>
          )}
        </div>
        <h1 className="page-title mt-2 text-2xl font-semibold text-gray-900 gradient-text">角色设定</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          书名：「{state.title}」。添加或编辑主要角色，确认后进入生成大纲。
        </p>
      </div>

      <div className="card-flat p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700">角色列表</span>
          <button type="button" onClick={handleSuggest} disabled={suggestLoading} className="btn-flat btn-primary text-sm">
            {suggestLoading ? '推荐中…' : 'AI 推荐角色'}
          </button>
          <button type="button" onClick={addCharacter} className="btn-flat text-sm">
            添加角色
          </button>
        </div>
        {suggestError && <p className="text-sm text-red-600">{suggestError}</p>}

        <div className="space-y-4">
          {characters.map((c) => (
            <div key={c.id} className="border border-[var(--color-border)] rounded-[var(--radius)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {c.name.trim() || `角色 ${characters.indexOf(c) + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeCharacter(c.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  删除
                </button>
              </div>
              <div className="grid gap-2 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-gray-500">姓名</span>
                  <input
                    value={c.name}
                    onChange={(e) => updateCharacter(c.id, 'name', e.target.value)}
                    className="input-flat"
                    placeholder="必填"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-500">身份</span>
                  <input
                    value={c.identity}
                    onChange={(e) => updateCharacter(c.id, 'identity', e.target.value)}
                    className="input-flat"
                    placeholder="选填"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-500">性格</span>
                  <input
                    value={c.personality}
                    onChange={(e) => updateCharacter(c.id, 'personality', e.target.value)}
                    className="input-flat"
                    placeholder="选填"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-500">目标/动机</span>
                  <input
                    value={c.goal}
                    onChange={(e) => updateCharacter(c.id, 'goal', e.target.value)}
                    className="input-flat"
                    placeholder="选填"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-500">与主角关系</span>
                  <input
                    value={c.relationToProtagonist}
                    onChange={(e) => updateCharacter(c.id, 'relationToProtagonist', e.target.value)}
                    className="input-flat"
                    placeholder="选填"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-500">口头禅/说话风格</span>
                  <input
                    value={c.speechStyle}
                    onChange={(e) => updateCharacter(c.id, 'speechStyle', e.target.value)}
                    className="input-flat"
                    placeholder="选填"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!characters.some((c) => c.name.trim())}
            className="btn-flat btn-primary"
          >
            确认角色，下一步
          </button>
          <Link to="/create/title" state={{ setting: state.setting, title: state.title, oneLinePromise: state.oneLinePromise }} className="btn-flat">
            取消
          </Link>
        </div>
      </div>
    </div>
  )
}
