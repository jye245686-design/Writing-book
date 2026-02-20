import path from 'path'
import { fileURLToPath } from 'node:url'
import fs from 'fs'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { suggestTitles, generateOutline, generateOutlineBatch, suggestCharacters, generateChapterContent, summarizeChapterEnding, summarizeChapterEndingFallback, runConsistencyCheck, generateSynopsis, ALLOWED_MODELS } from './ai/deepseek.js'
import { createProject, readProject, writeProject, listProjects } from './store/projects.js'
import { sendVerificationCode, loginWithCode, loginWithPassword, registerWithPassword, requireAuth } from './auth.js'
import { getPool, ensureSchema } from './db-mysql.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors({ origin: true }))
// 大纲 500+ 章时 JSON 体积可能超过 100kb，需提高限制避免 PATCH 保存失败
app.use(express.json({ limit: '10mb' }))

/** 世界背景 + 细分方向 拼成 AI 用字符串，如「古代（古风探案）」 */
function worldBackgroundForAi(worldBackground, worldBackgroundSub) {
  if (!worldBackground) return ''
  return worldBackgroundSub ? `${worldBackground}（${worldBackgroundSub}）` : worldBackground
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

// ---------- 认证 ----------
/** 注册：用户 ID + 密码，返回 { user, token } */
app.post('/api/auth/register', async (req, res) => {
  const { userId, password } = req.body || {}
  const result = await registerWithPassword(userId, password)
  if (result.error) {
    return res.status(400).json({ error: result.error })
  }
  res.status(201).json(result)
})

/** 登录：支持 ① 用户 ID + 密码 ② 手机号 + 验证码（短信开通后使用），返回 { user, token } */
app.post('/api/auth/login', async (req, res) => {
  const { userId, password, phone, code } = req.body || {}
  if (userId !== undefined && userId !== '' && password !== undefined) {
    const result = await loginWithPassword(userId, password)
    if (result.error) {
      return res.status(401).json({ error: result.error })
    }
    return res.json(result)
  }
  if (phone !== undefined && code !== undefined) {
    const result = await loginWithCode(phone, code)
    if (result.error) {
      return res.status(401).json({ error: result.error })
    }
    return res.json(result)
  }
  return res.status(400).json({ error: '请使用用户 ID + 密码登录，或手机号 + 验证码登录' })
})

/** 发送验证码（短信服务开通后使用；已配置腾讯云短信则发真实短信） */
app.post('/api/auth/send-code', async (req, res) => {
  const { phone } = req.body || {}
  const result = await sendVerificationCode(phone)
  if (result.error) {
    return res.status(400).json({ error: result.error })
  }
  res.json({ success: true })
})

/** 获取当前登录用户（需携带 Authorization: Bearer <token>） */
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// ---------- 业务接口 ----------
/** 获取可用的模型列表（供前端模型/类型选择） */
app.get('/api/ai/models', (req, res) => {
  res.json({ models: ALLOWED_MODELS })
})

app.post('/api/ai/titles/suggest', async (req, res) => {
  try {
    const { worldBackground, worldBackgroundSub, genre, coreIdea, optionalTags, previousCandidates, model } = req.body || {}
    if (!worldBackground || !genre) {
      return res.status(400).json({ error: '缺少 worldBackground 或 genre' })
    }
    const candidates = await suggestTitles({
      worldBackground: worldBackgroundForAi(worldBackground, worldBackgroundSub),
      genre,
      coreIdea: coreIdea || '',
      optionalTags: Array.isArray(optionalTags) ? optionalTags : [],
      previousCandidates: Array.isArray(previousCandidates) ? previousCandidates : [],
      model: model || undefined,
    })
    res.json({ candidates })
  } catch (err) {
    console.error('[/api/ai/titles/suggest]', err)
    res.status(500).json({
      error: err.message || '生成书名失败',
    })
  }
})

app.post('/api/ai/characters/suggest', async (req, res) => {
  try {
    const { title, worldBackground, worldBackgroundSub, genre, coreIdea, oneLinePromise, optionalTags, model } = req.body || {}
    if (!title || !worldBackground || !genre) {
      return res.status(400).json({ error: '缺少 title、worldBackground 或 genre' })
    }
    const characters = await suggestCharacters({
      title,
      worldBackground: worldBackgroundForAi(worldBackground, worldBackgroundSub),
      genre,
      coreIdea: coreIdea || '',
      oneLinePromise: oneLinePromise || '',
      optionalTags: Array.isArray(optionalTags) ? optionalTags : [],
      model: model || undefined,
    })
    res.json({ characters })
  } catch (err) {
    console.error('[/api/ai/characters/suggest]', err)
    res.status(500).json({
      error: err.message || '推荐角色失败',
    })
  }
})

/** 生成大纲（支持带/不带尾部斜杠，避免代理或客户端重定向导致 404） */
app.post(['/api/ai/outline/generate', '/api/ai/outline/generate/'], async (req, res) => {
  try {
    const { title, worldBackground, worldBackgroundSub, genre, coreIdea, oneLinePromise, optionalTags, totalChapters, characters, model } = req.body || {}
    if (!title || !worldBackground || !genre) {
      return res.status(400).json({ error: '缺少 title、worldBackground 或 genre' })
    }
    const numChapters = Math.min(1000, Math.max(1, Number(totalChapters) || 30))
    const outline = await generateOutline({
      title,
      worldBackground: worldBackgroundForAi(worldBackground, worldBackgroundSub),
      genre,
      coreIdea: coreIdea || '',
      oneLinePromise: oneLinePromise || '',
      optionalTags: Array.isArray(optionalTags) ? optionalTags : [],
      totalChapters: numChapters,
      characters: Array.isArray(characters) ? characters : [],
      model: model || undefined,
    })
    res.json(outline)
  } catch (err) {
    console.error('[/api/ai/outline/generate]', err)
    res.status(500).json({
      error: err.message || '生成大纲失败',
    })
  }
})

/** 分批生成大纲（用于 30 章等长大纲）；支持带/不带尾部斜杠 */
const outlineBatchHandler = async (req, res) => {
  try {
    const { title, worldBackground, worldBackgroundSub, genre, coreIdea, oneLinePromise, optionalTags, totalChapters, characters, startChapterIndex, endChapterIndex, previousChapters, model } = req.body || {}
    if (!title || !worldBackground || !genre) {
      return res.status(400).json({ error: '缺少 title、worldBackground 或 genre' })
    }
    const numChapters = Math.min(1000, Math.max(1, Number(totalChapters) || 30))
    const start = Math.max(1, Math.min(Number(startChapterIndex) || 1, numChapters))
    const end = Math.max(start, Math.min(Number(endChapterIndex) || start, numChapters))
    const result = await generateOutlineBatch({
      title,
      worldBackground: worldBackgroundForAi(worldBackground, worldBackgroundSub),
      genre,
      coreIdea: coreIdea || '',
      oneLinePromise: oneLinePromise || '',
      optionalTags: Array.isArray(optionalTags) ? optionalTags : [],
      totalChapters: numChapters,
      characters: Array.isArray(characters) ? characters : [],
      startChapterIndex: start,
      endChapterIndex: end,
      previousChapters: Array.isArray(previousChapters) ? previousChapters : [],
      model: model || undefined,
    })
    res.json(result)
  } catch (err) {
    console.error('[/api/ai/outline/generate-batch]', err)
    res.status(500).json({
      error: err.message || '生成大纲失败',
    })
  }
}
app.post('/api/ai/outline/generate-batch', outlineBatchHandler)
app.post('/api/ai/outline/generate-batch/', outlineBatchHandler)

/** 前文摘要：从已持久化的章节中取每章末尾，总长上限约 3000 字（用于一致性检查等） */
function buildPreviousSummaryFromProject(project, upToChapterIndex, tailCharsPerChapter = 600, maxTotalChars = 3000) {
  const parts = []
  let total = 0
  const chapters = project.chapters || {}
  for (let i = 1; i < upToChapterIndex; i++) {
    const ch = chapters[String(i)]
    if (!ch?.content) continue
    const tail = ch.content.slice(-tailCharsPerChapter)
    if (tail.length + total > maxTotalChars) {
      parts.push(tail.slice(-(maxTotalChars - total)))
      total = maxTotalChars
      break
    }
    parts.push(tail)
    total += tail.length
  }
  return parts.join('\n---\n')
}

/** 上一章衔接用：优先用 AI 保存的结尾摘要，无则用上一章正文末尾；第一章返回空 */
function getPreviousChapterEndingContext(project, chapterIndex, tailChars = 1500) {
  if (chapterIndex <= 1) return ''
  const ch = (project.chapters || {})[String(chapterIndex - 1)]
  if (!ch?.content) return ''
  const summary = ch.endingSummary && String(ch.endingSummary).trim()
  if (summary) return `【上一章结尾摘要，供本章开头衔接】\n${summary}`
  return ch.content.slice(-tailChars)
}

/** 仅当项目存在且属于当前用户时返回 project，否则返回 null */
async function getProjectForUser(projectId, userId) {
  const project = await readProject(projectId)
  if (!project || project.userId !== userId) return null
  return project
}

/** 获取项目列表（仅当前用户）；需登录 */
app.get(['/api/projects', '/api/projects/'], requireAuth, async (req, res) => {
  try {
    const list = await listProjects(req.user.id)
    res.json({ projects: list })
  } catch (err) {
    console.error('[/api/projects]', err)
    res.status(500).json({ error: err.message || '获取项目列表失败' })
  }
})

/** 创建项目；需登录，项目归属当前用户。可先传 setting/title/characters 建草稿（outline 可为空），后续 PATCH 补充大纲 */
app.post(['/api/projects', '/api/projects/'], requireAuth, async (req, res) => {
  try {
    const { setting, title, oneLinePromise, characters, outline } = req.body || {}
    if (!setting) {
      return res.status(400).json({ error: '缺少 setting' })
    }
    const outlineChapters = outline?.chapters
    const hasOutline = Array.isArray(outlineChapters) && outlineChapters.length > 0
    const project = await createProject({
      userId: req.user.id,
      setting: {
        worldBackground: String(setting.worldBackground ?? ''),
        worldBackgroundSub: setting.worldBackgroundSub != null ? String(setting.worldBackgroundSub) : undefined,
        genre: String(setting.genre ?? ''),
        coreIdea: String(setting.coreIdea ?? ''),
        optionalTags: Array.isArray(setting.optionalTags) ? setting.optionalTags : undefined,
      },
      title: title != null ? String(title) : '',
      oneLinePromise: oneLinePromise != null ? String(oneLinePromise) : '',
      characters: Array.isArray(characters) ? characters : [],
      outline: {
        totalChapters: hasOutline ? (Number(outline.totalChapters) || outlineChapters.length) : 0,
        chapters: hasOutline ? outlineChapters : [],
      },
    })
    res.status(201).json(project)
  } catch (err) {
    console.error('[/api/projects]', err)
    res.status(500).json({ error: err.message || '创建项目失败' })
  }
})

/** 导出项目：仅 TXT；需登录且项目归属当前用户 */
app.get('/api/projects/:id/export', requireAuth, async (req, res) => {
  const project = await getProjectForUser(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const format = (req.query.format || 'txt').toLowerCase()
  if (format !== 'txt') {
    return res.status(400).json({ error: '仅支持 format=txt' })
  }
  const outline = project.outline || { chapters: [] }
  const chapters = project.chapters || {}
  const scope = (req.query.scope || 'locked').toLowerCase()
  let indexesToExport = []

  if (scope === 'all') {
    indexesToExport = outline.chapters
      .filter((ch) => {
        const chap = chapters[String(ch.chapterIndex)]
        return chap?.content
      })
      .map((ch) => ch.chapterIndex)
    if (indexesToExport.length === 0) {
      return res.status(400).json({ error: '暂无有正文的章节，请先生成或锁定章节后再导出' })
    }
  } else {
    const lockedIndexes = outline.chapters
      .filter((ch) => chapters[String(ch.chapterIndex)]?.status === 'locked')
      .map((ch) => ch.chapterIndex)
    const queryChapters = req.query.chapters
    if (queryChapters && String(queryChapters).trim()) {
      const requested = String(queryChapters)
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1)
      indexesToExport = requested.filter((i) => lockedIndexes.includes(i))
    } else {
      indexesToExport = lockedIndexes
    }
    if (indexesToExport.length === 0) {
      return res.status(400).json({ error: '没有已锁定的章节或未勾选章节，请先锁定并勾选要导出的章节' })
    }
    indexesToExport.sort((a, b) => a - b)
  }

  const lines = [project.title || '未命名', '', project.oneLinePromise ? `一句话承诺：${project.oneLinePromise}` : '', '']
  outline.chapters.forEach((ch) => {
    if (!indexesToExport.includes(ch.chapterIndex)) return
    const chap = chapters[String(ch.chapterIndex)]
    const content = chap?.content ?? ''
    lines.push(`第 ${ch.chapterIndex} 章 ${ch.title}`)
    lines.push('')
    lines.push(content)
    lines.push('')
    lines.push('')
  })
  const txt = lines.join('\n')
  const filename = `${(project.title || 'book').replace(/[/\\?%*:|"]/g, '_')}.txt`
  res.type('text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  res.send(txt)
})

/** 获取项目；需登录且项目归属当前用户 */
app.get('/api/projects/:id', requireAuth, async (req, res) => {
  const project = await getProjectForUser(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  res.json(project)
})

/** 更新项目（设定、书名、角色、大纲等）；需登录且项目归属当前用户 */
app.patch('/api/projects/:id', requireAuth, async (req, res) => {
  const project = await getProjectForUser(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const { setting, title, oneLinePromise, characters, outline, synopsis } = req.body || {}
  if (setting) {
    project.setting = {
      worldBackground: String(setting.worldBackground ?? project.setting.worldBackground ?? ''),
      worldBackgroundSub: setting.worldBackgroundSub != null ? String(setting.worldBackgroundSub) : (project.setting.worldBackgroundSub ?? undefined),
      genre: String(setting.genre ?? project.setting.genre ?? ''),
      coreIdea: String(setting.coreIdea ?? project.setting.coreIdea ?? ''),
      optionalTags: setting.optionalTags != null ? (Array.isArray(setting.optionalTags) ? setting.optionalTags : project.setting.optionalTags) : (project.setting.optionalTags ?? undefined),
    }
  }
  if (title !== undefined) project.title = String(title)
  if (oneLinePromise !== undefined) project.oneLinePromise = String(oneLinePromise)
  if (Array.isArray(characters)) project.characters = characters
  if (outline) {
    project.outline = {
      totalChapters: Number(outline.totalChapters) ?? project.outline.totalChapters,
      chapters: Array.isArray(outline.chapters) ? outline.chapters : project.outline.chapters,
    }
  }
  if (synopsis !== undefined) project.synopsis = String(synopsis)
  project.updatedAt = new Date().toISOString()
  await writeProject(project)
  res.json(project)
})

/** 分片保存大纲：合并一段章节到项目，避免单次 body 过大；需登录且项目归属当前用户 */
app.patch('/api/projects/:id/outline-chunk', requireAuth, async (req, res) => {
  const project = await getProjectForUser(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const { totalChapters, startChapterIndex, chapters } = req.body || {}
  if (
    !Number.isInteger(totalChapters) ||
    totalChapters < 1 ||
    !Number.isInteger(startChapterIndex) ||
    startChapterIndex < 1 ||
    !Array.isArray(chapters) ||
    chapters.length === 0
  ) {
    return res.status(400).json({ error: '缺少 totalChapters、startChapterIndex 或 chapters' })
  }
  const start = startChapterIndex - 1
  const end = start + chapters.length
  project.outline = project.outline || { totalChapters: 0, chapters: [] }
  const existing = project.outline.chapters || []
  const newChapters = [...existing.slice(0, start), ...chapters, ...existing.slice(end)]
  project.outline.chapters = newChapters.length > totalChapters ? newChapters.slice(0, totalChapters) : newChapters
  project.outline.totalChapters = totalChapters
  project.updatedAt = new Date().toISOString()
  await writeProject(project)
  res.json(project)
})

/** 生成并保存作品简介（根据设定、角色、大纲由 AI 生成）；需登录且项目归属当前用户 */
app.post('/api/projects/:id/synopsis/generate', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.user.id)
    if (!project) return res.status(404).json({ error: '项目不存在' })
    const outline = project.outline || { chapters: [] }
    if (!outline.chapters || outline.chapters.length === 0) {
      return res.status(400).json({ error: '请先完成大纲后再生成简介' })
    }
    const text = await generateSynopsis(project)
    project.synopsis = text
    project.updatedAt = new Date().toISOString()
    await writeProject(project)
    res.json({ synopsis: text })
  } catch (err) {
    console.error('[/api/projects/:id/synopsis/generate]', err)
    res.status(500).json({ error: err.message || '生成简介失败' })
  }
})

/** 按项目 + 章节生成正文；需登录且项目归属当前用户 */
app.post('/api/projects/:id/chapters/:chapterIndex/generate', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.user.id)
    if (!project) return res.status(404).json({ error: '项目不存在' })
    const chapterIndex = Number(req.params.chapterIndex)
    if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
      return res.status(400).json({ error: '无效的 chapterIndex' })
    }
    const outlineChapters = project.outline?.chapters ?? []
    const outlineChapter = outlineChapters.find((c) => c.chapterIndex === chapterIndex)
    if (!outlineChapter) {
      return res.status(400).json({ error: '大纲中无该章节' })
    }
    const { wordCount: rawWordCount } = req.body || {}
    const wordCount = Math.min(8000, Math.max(500, Number(rawWordCount) || 3000))
    if (chapterIndex > 1) {
      const prevCh = (project.chapters || {})[String(chapterIndex - 1)]
      if (prevCh?.content && !(prevCh.endingSummary && String(prevCh.endingSummary).trim())) {
        try {
          const fallback = await summarizeChapterEndingFallback(prevCh.content)
          if (fallback) {
            prevCh.endingSummary = fallback
            project.updatedAt = new Date().toISOString()
            await writeProject(project)
          }
        } catch (err) {
          console.error('[summarizeChapterEndingFallback]', err)
        }
      }
    }
    const previousSummary = getPreviousChapterEndingContext(project, chapterIndex, 1500)
    const result = await generateChapterContent({
      title: project.title,
      worldBackground: worldBackgroundForAi(project.setting.worldBackground, project.setting.worldBackgroundSub),
      genre: project.setting.genre,
      coreIdea: project.setting.coreIdea || '',
      oneLinePromise: project.oneLinePromise || '',
      optionalTags: Array.isArray(project.setting.optionalTags) ? project.setting.optionalTags : [],
      characters: project.characters || [],
      chapterIndex,
      chapterTitle: outlineChapter.title,
      chapterGoal: outlineChapter.goal || '',
      chapterPoints: outlineChapter.points || [],
      previousSummary,
      wordCount,
    })
    let endingSummary = ''
    try {
      endingSummary = await summarizeChapterEnding(result.content, { chapterIndex }) || ''
    } catch (err) {
      console.error('[summarizeChapterEnding]', err)
    }
    if (!endingSummary) {
      try {
        endingSummary = await summarizeChapterEndingFallback(result.content) || ''
      } catch (err) {
        console.error('[summarizeChapterEndingFallback]', err)
      }
    }
    project.chapters = project.chapters || {}
    project.chapters[String(chapterIndex)] = {
      content: result.content,
      wordCount,
      status: 'draft',
      ...(endingSummary && { endingSummary }),
    }
    project.updatedAt = new Date().toISOString()
    await writeProject(project)
    res.json({
      content: result.content,
      chapterIndex,
      wordCount,
      status: 'draft',
    })
  } catch (err) {
    console.error('[/api/projects/:id/chapters/:chapterIndex/generate]', err)
    res.status(500).json({ error: err.message || '生成章节正文失败' })
  }
})

/** 更新章节（正文、状态或结尾摘要）；需登录且项目归属当前用户 */
app.patch('/api/projects/:id/chapters/:chapterIndex', requireAuth, async (req, res) => {
  const project = await getProjectForUser(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const chapterIndex = String(req.params.chapterIndex)
  const { content, status, endingSummary } = req.body || {}
  project.chapters = project.chapters || {}

  if (!project.chapters[chapterIndex]) {
    const outline = project.outline || { chapters: [] }
    const inOutline = outline.chapters.some((c) => String(c.chapterIndex) === chapterIndex)
    if (!inOutline) return res.status(404).json({ error: '该章节不在大纲中' })
    if (content === undefined && status === undefined && endingSummary === undefined) {
      return res.status(404).json({ error: '该章节尚未生成' })
    }
    project.chapters[chapterIndex] = {
      content: content !== undefined ? String(content) : '',
      wordCount: 0,
      status: status === 'locked' || status === 'draft' ? status : 'draft',
      ...(endingSummary !== undefined && { endingSummary: String(endingSummary) }),
    }
  } else {
    if (content !== undefined) project.chapters[chapterIndex].content = String(content)
    if (status === 'locked' || status === 'draft') project.chapters[chapterIndex].status = status
    if (endingSummary !== undefined) project.chapters[chapterIndex].endingSummary = String(endingSummary)
  }

  project.updatedAt = new Date().toISOString()
  await writeProject(project)
  res.json(project.chapters[chapterIndex])
})

/** 发起一致性检查；需登录且项目归属当前用户 */
app.post('/api/projects/:id/consistency/run', requireAuth, async (req, res) => {
  try {
    const project = await getProjectForUser(req.params.id, req.user.id)
    if (!project) return res.status(404).json({ error: '项目不存在' })
    project.consistencyReport = {
      projectId: project.id,
      checkedAt: new Date().toISOString(),
      issues: [],
      status: 'running',
    }
    await writeProject(project)
    const result = await runConsistencyCheck(project)
    project.consistencyReport = {
      projectId: project.id,
      checkedAt: new Date().toISOString(),
      issues: result.issues,
      status: result.status,
    }
    project.updatedAt = new Date().toISOString()
    await writeProject(project)
    res.json(project.consistencyReport)
  } catch (err) {
    console.error('[/api/projects/:id/consistency/run]', err)
    const project = await getProjectForUser(req.params.id, req.user.id)
    if (project?.consistencyReport?.status === 'running') {
      project.consistencyReport.status = 'failed'
      await writeProject(project)
    }
    res.status(500).json({ error: err.message || '一致性检查失败' })
  }
})

/** 获取一致性检查状态；需登录且项目归属当前用户 */
app.get('/api/projects/:id/consistency/status', requireAuth, async (req, res) => {
  const project = await getProjectForUser(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const report = project.consistencyReport
  res.json({
    status: report?.status ?? 'none',
    checkedAt: report?.checkedAt ?? null,
  })
})

/** 获取一致性检查报告；需登录且项目归属当前用户 */
app.get('/api/projects/:id/consistency/report', requireAuth, async (req, res) => {
  const project = await getProjectForUser(req.params.id, req.user.id)
  if (!project) return res.status(404).json({ error: '项目不存在' })
  const report = project.consistencyReport
  if (!report) return res.status(404).json({ error: '暂无检查报告，请先发起检查' })
  res.json(report)
})

/** 按章生成正文（无状态：客户端带齐上下文，保留兼容） */
app.post('/api/ai/chapters/generate', async (req, res) => {
  try {
    const {
      title,
      worldBackground,
      genre,
      coreIdea,
      oneLinePromise,
      characters,
      chapterIndex,
      chapterTitle,
      chapterGoal,
      chapterPoints,
      previousSummary,
      wordCount,
      model,
    } = req.body || {}
    if (
      title == null ||
      worldBackground == null ||
      genre == null ||
      chapterIndex == null ||
      chapterTitle == null
    ) {
      return res.status(400).json({
        error: '缺少必填参数：title、worldBackground、genre、chapterIndex、chapterTitle',
      })
    }
    const numWordCount = Math.min(8000, Math.max(500, Number(wordCount) || 3000))
    const result = await generateChapterContent({
      title: String(title),
      worldBackground: String(worldBackground),
      genre: String(genre),
      coreIdea: coreIdea != null ? String(coreIdea) : '',
      oneLinePromise: oneLinePromise != null ? String(oneLinePromise) : '',
      characters: Array.isArray(characters) ? characters : [],
      chapterIndex: Number(chapterIndex),
      chapterTitle: String(chapterTitle),
      chapterGoal: chapterGoal != null ? String(chapterGoal) : '',
      chapterPoints: Array.isArray(chapterPoints) ? chapterPoints : [],
      previousSummary: previousSummary != null ? String(previousSummary) : '',
      wordCount: numWordCount,
      model: model || undefined,
    })
    res.json(result)
  } catch (err) {
    console.error('[/api/ai/chapters/generate]', err)
    res.status(500).json({
      error: err.message || '生成章节正文失败',
    })
  }
})

/** 未匹配到的 API 请求返回 404 并带上 path/method 便于排查（如代理改写路径导致） */
app.use('/api', (req, res) => {
  res.status(404).json({
    error: '接口不存在',
    path: req.path,
    method: req.method,
  })
})

// ---------- 生产环境：托管前端静态资源（单体部署时前端与 API 同域，无需配置 VITE_API_BASE_URL） ----------
const isProduction = process.env.NODE_ENV === 'production'
const publicDir = process.env.PUBLIC_DIR || path.resolve(__dirname, '..', 'web', 'dist')
if (isProduction && fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false }))
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

;(async () => {
  const pool = await getPool()
  if (pool) {
    try {
      await ensureSchema()
      console.log('[存储] MySQL 已连接，数据存数据库')
    } catch (e) {
      console.error('MySQL ensureSchema failed', e)
    }
  } else {
    console.log('[存储] 未配置 MySQL（无 DATABASE_URL 或 MYSQL_HOST/USER/PASSWORD），使用本地 JSON 文件：server/data/')
  }
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`)
    if (isProduction && fs.existsSync(publicDir)) {
      console.log('Serving frontend from', publicDir)
    }
  })
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n端口 ${PORT} 已被占用，后端无法启动。`)
      console.error('请任选一种方式处理：')
      console.error(`  1) 查看并结束占用进程：lsof -i :${PORT}`)
      console.error(`     然后执行：kill -9 <PID>`)
      console.error(`  2) 换用其他端口：在项目根目录 .env 中设置 PORT=3003（或其它未占用端口）`)
      console.error(`     并修改 web/.env.development 中 VITE_API_BASE_URL 为对应地址\n`)
      process.exit(1)
    }
    throw err
  })
})()

