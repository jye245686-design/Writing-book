import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

/** 世界背景：主类 + 细分方向（可当按钮）+ 最搭题材（推荐提示） */
const WORLD_BACKGROUNDS = [
  {
    value: '古代',
    label: '古代',
    subDirections: ['古风探案', '朝堂权谋', '江湖门派', '志怪民俗', '种田基建', '宗门修仙'],
    bestGenres: ['悬疑', '武侠', '玄幻', '言情'],
  },
  {
    value: '现代',
    label: '现代',
    subDirections: ['灵气复苏', '都市异能', '职业文', '商战', '直播文', '规则怪谈入侵城市'],
    bestGenres: ['都市', '悬疑', '玄幻'],
  },
  {
    value: '末世',
    label: '末世',
    subDirections: ['囤货生存', '基地经营', '异能进化', '丧尸/异种', '天灾', '副本化末世'],
    bestGenres: ['科幻', '玄幻', '言情'],
  },
  {
    value: '星际',
    label: '星际',
    subDirections: ['机甲', '军校升级', '星际种田', '虫族', '文明博弈', '星海修仙'],
    bestGenres: ['科幻', '玄幻', '言情'],
  },
]

const GENRES = [
  { value: '玄幻', label: '玄幻' },
  { value: '言情', label: '言情' },
  { value: '悬疑', label: '悬疑' },
  { value: '都市', label: '都市' },
  { value: '科幻', label: '科幻' },
  { value: '武侠', label: '武侠' },
]

/** 可选标签（更贴近平台口味）：7 层 + 建议补充 + 适配原因，用于增强生成效果 */
const OPTIONAL_TAGS = [
  {
    layer: '机制/外挂',
    tags: ['系统', '面板/词条', '模拟器', '签到', '抽卡', '天赋树', '职业面板'],
    reason: '目标清晰、升级快、剧情天然有节奏',
  },
  {
    layer: '时空/身份',
    tags: ['重生', '穿越', '穿书', '平行世界', '回档', '夺舍'],
    reason: '开局即冲突，「我知道未来/我换了身份」自带优势',
  },
  {
    layer: '结构玩法',
    tags: ['无限流', '副本', '规则怪谈', '逃生', '推演', '多线叙事'],
    reason: '每个副本都是一个小高潮，留存高',
  },
  {
    layer: '内容风格',
    tags: ['轻克苏鲁', '诡异复苏', '国风民俗', '赛博', '轻沙雕', '轻迪化'],
    reason: '更容易做差异化，同时不牺牲爽感',
  },
  {
    layer: '生活向爽点',
    tags: ['种田', '基建', '经营', '养成', '直播', '开店'],
    reason: '把「日常」写成「升级」，读者粘性强',
  },
  {
    layer: '情感向钩子',
    tags: ['先婚后爱', '追妻火葬场', '双强', '救赎', '甜宠', '带崽'],
    reason: '情绪价值稳定输出，适合女频/泛女频',
  },
  {
    layer: '目标导向',
    tags: ['复仇', '逆袭', '保命', '护家人', '冲榜封神', '苟到无敌'],
    reason: '主线明确，不容易写散',
  },
]

type CreateLocationState = {
  setting?: { worldBackground: string; worldBackgroundSub?: string; genre: string; coreIdea: string; optionalTags?: string[] }
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
  const [worldBackgroundSub, setWorldBackgroundSub] = useState(locationState?.setting?.worldBackgroundSub ?? '')
  const [genre, setGenre] = useState(locationState?.setting?.genre ?? '')
  const [coreIdea, setCoreIdea] = useState(locationState?.setting?.coreIdea ?? '')
  const [optionalTags, setOptionalTags] = useState<string[]>(locationState?.setting?.optionalTags ?? [])

  const currentMeta = WORLD_BACKGROUNDS.find((w) => w.value === worldBackground)

  const toggleTag = (tag: string) => {
    setOptionalTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleMainBackground = (value: string) => {
    setWorldBackground(value)
    setWorldBackgroundSub('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const setting = {
      worldBackground,
      ...(worldBackgroundSub && { worldBackgroundSub }),
      genre,
      coreIdea,
      ...(optionalTags.length > 0 && { optionalTags }),
    }
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
                onClick={() => handleMainBackground(opt.value)}
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
          {currentMeta && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">细分方向（选填，可当按钮点选）</p>
              <div className="flex flex-wrap gap-2">
                {currentMeta.subDirections.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setWorldBackgroundSub(worldBackgroundSub === sub ? '' : sub)}
                    className={
                      'rounded-[var(--radius)] border px-3 py-1.5 text-xs transition-colors ' +
                      (worldBackgroundSub === sub
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] bg-white text-gray-600 hover:bg-gray-50')
                    }
                  >
                    {sub}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                最搭题材：{currentMeta.bestGenres.join('、')}（可在下方题材中选）
              </p>
            </div>
          )}
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            可选标签 <span className="text-[var(--color-text-muted)] font-normal">（选填，更贴近平台口味）</span>
          </label>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            勾选与本书相符的标签，有助于书名、大纲与正文风格更统一、爽点更明确。
          </p>
          <div className="space-y-4">
            {OPTIONAL_TAGS.map((group) => (
              <div key={group.layer} className="rounded border border-[var(--color-border)] p-3 bg-gray-50/50">
                <p className="text-xs font-medium text-gray-600 mb-1">{group.layer}</p>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">{group.reason}</p>
                <div className="flex flex-wrap gap-2">
                  {group.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={
                        'rounded-[var(--radius)] border px-2.5 py-1 text-xs transition-colors ' +
                        (optionalTags.includes(tag)
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] bg-white text-gray-600 hover:bg-gray-100')
                      }
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
