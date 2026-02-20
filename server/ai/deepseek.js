const DEEPSEEK_BASE = 'https://api.deepseek.com'

// API 当前最新：deepseek-chat = DeepSeek-V3.2 非思考，deepseek-reasoner = V3.2 思考模式（128K 上下文）
const DEFAULT_MODEL = 'deepseek-chat'

const MAX_RETRIES = 3

/** 带重试的 fetch：失败时最多重试 MAX_RETRIES 次，间隔 1s/2s/3s */
async function fetchWithRetry(url, options, retriesLeft = MAX_RETRIES) {
  try {
    const response = await fetch(url, options)
    if (response.ok) return response
    const text = await response.text()
    const err = new Error(text || `DeepSeek API 错误: ${response.status}`)
    if (retriesLeft <= 0) throw err
  } catch (e) {
    if (retriesLeft <= 0) throw e
  }
  const delayMs = 1000 * (MAX_RETRIES - retriesLeft + 1)
  await new Promise((r) => setTimeout(r, delayMs))
  return fetchWithRetry(url, options, retriesLeft - 1)
}

/** 允许的模型列表，供前端模型选择使用 */
export const ALLOWED_MODELS = [
  { id: 'deepseek-chat', name: 'DeepSeek-V3.2（非思考）', type: 'chat' },
  { id: 'deepseek-reasoner', name: 'DeepSeek-V3.2（思考模式）', type: 'reasoner' },
]

function getApiKey() {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key || !key.trim()) {
    throw new Error('未配置 DEEPSEEK_API_KEY，请在项目根目录 .env 中设置')
  }
  return key.trim()
}

function resolveModel(override) {
  const allowed = new Set(ALLOWED_MODELS.map((m) => m.id))
  if (override && allowed.has(override)) return override
  return process.env.DEEPSEEK_MODEL || DEFAULT_MODEL
}

/**
 * 构建统一的「本书设定」摘要块，供书名/大纲/正文等 prompt 使用，保证与设定和标签紧贴
 * @param {{ worldBackground: string, genre: string, coreIdea?: string, oneLinePromise?: string, optionalTags?: string[] }}
 */
function buildSettingBlock({ worldBackground, genre, coreIdea = '', oneLinePromise = '', optionalTags = [] }) {
  let block = `【本书设定（必须严格遵循，不得偏离）】\n世界背景：${worldBackground}\n题材：${genre}`
  if (coreIdea.trim()) block += `\n核心创意：${coreIdea.trim()}`
  if (oneLinePromise.trim()) block += `\n全书一句话承诺：${oneLinePromise.trim()}`
  if (Array.isArray(optionalTags) && optionalTags.length > 0) {
    block += `\n可选标签（风格与爽点须在内容中体现）：${optionalTags.join('、')}`
  }
  return block
}

/** 统一约束句，用于大纲与正文，减少偏离设定 */
const CONSTRAINT_LINE = '\n禁止：出现与上述设定和标签无关或矛盾的背景、风格、词汇或剧情。'

/**
 * 调用 DeepSeek 生成 3 个小说书名候选，且与 previousCandidates 不重复
 * @param {Object} opts - worldBackground, genre, coreIdea, previousCandidates, model（可选，覆盖默认与 env）
 */
export async function suggestTitles({ worldBackground, genre, coreIdea, optionalTags = [], previousCandidates, model: modelOverride }) {
  const model = resolveModel(modelOverride)
  const systemPrompt = `你是一个小说书名生成助手。根据用户给出的本书设定生成恰好 3 个中文小说书名。要求：
- 书名必须严格贴合给定的世界背景、题材、核心创意与可选标签，不得出现与之无关或矛盾的风格；
- 若提供可选标签，书名应直接体现这些标签所代表的风格/爽点（如系统流、重生、甜宠、逆袭等）；
- 只输出一个 JSON 对象，格式为：{"candidates": ["书名1", "书名2", "书名3"]}
- 不要输出任何其他文字、说明或 markdown 标记，仅此 JSON。`

  const settingBlock = buildSettingBlock({ worldBackground, genre, coreIdea: coreIdea || '', optionalTags })
  let userPrompt = `${settingBlock}\n\n请根据以上设定生成 3 个书名，严格贴合设定与标签。`
  if (previousCandidates && previousCandidates.length > 0) {
    userPrompt += `\n\n请勿与以下书名重复，生成全新的 3 个：\n${previousCandidates.join('\n')}`
  }
  userPrompt += '\n\n请直接输出上述格式的 JSON。'

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // reasoner 的 max_tokens 包含思考+答案总和，给足空间避免 content 被截断
      max_tokens: 4096,
      temperature: 0.8,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  // deepseek-reasoner 会返回 reasoning_content（思考过程）和 content（最终答案）；content 可能为空时从 reasoning 中提取 JSON
  let content = message?.content?.trim() || ''
  const reasoningContent = message?.reasoning_content?.trim() || ''

  if (!content && reasoningContent) {
    // 尝试从思考内容末尾提取 {"candidates": [...]} 形式的 JSON
    const jsonMatch = reasoningContent.match(/\{\s*"candidates"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (jsonMatch) {
      content = jsonMatch[0]
    } else {
      content = reasoningContent
    }
  }

  if (!content) {
    console.error('[DeepSeek] 响应 message:', JSON.stringify(message, null, 2))
    throw new Error('DeepSeek 未返回内容')
  }

  // 兼容可能被包裹在 markdown 代码块里的 JSON，或整段文字中嵌入了 JSON
  let jsonStr = content
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    jsonStr = codeBlock[1].trim()
  } else {
    const embedded = content.match(/\{\s*"candidates"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (embedded) {
      jsonStr = embedded[0]
    }
  }

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('解析书名结果失败，请重试')
  }

  const list = parsed?.candidates
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('未得到有效书名列表，请重试')
  }

  return list.slice(0, 3).map((t) => String(t).trim()).filter(Boolean)
}

/**
 * 调用 DeepSeek 根据书名、设定与已确认角色生成全书大纲（每章：标题、一句话目标、3～5 个要点）
 * @param {Object} opts - title, worldBackground, genre, coreIdea?, oneLinePromise?, totalChapters, characters?, model?
 * @returns {{ totalChapters: number, chapters: Array<{ chapterIndex: number, title: string, goal: string, points: string[] }> }}
 */
export async function generateOutline({
  title,
  worldBackground,
  genre,
  coreIdea = '',
  oneLinePromise = '',
  optionalTags = [],
  totalChapters,
  characters = [],
  model: modelOverride,
}) {
  const model = resolveModel(modelOverride)
  const systemPrompt = `你是一个小说大纲助手。根据书名与**本书设定**（世界背景、题材、核心创意、一句话承诺、可选标签）以及**已确认的角色列表**，生成整本小说的章节大纲。要求：
- 大纲必须严格贴合本书设定与可选标签，章节目标与要点不得偏离世界背景、题材与标签所约定的风格与爽点；
- **必须根据下列角色设计章节与冲突**，让剧情围绕这些角色展开，人物动机与关系需与角色设定一致；
- 若含可选标签（如系统、重生、无限流、种田、甜宠、逆袭等），大纲中须体现相应元素与节奏；
- 输出一个 JSON 对象，格式为：{"chapters": [{"chapterIndex": 1, "title": "章标题", "goal": "本章一句话目标", "points": ["要点1","要点2","要点3"]}, ...]}；chapterIndex 从 1 开始连续编号；每章必须有 title、goal、points；points 为 3～5 个关键要点；
- 不要输出任何其他文字或 markdown 标记，仅此 JSON。`

  const settingBlock = buildSettingBlock({ worldBackground, genre, coreIdea, oneLinePromise, optionalTags })
  let userPrompt = `书名：${title}\n\n${settingBlock}`
  userPrompt += CONSTRAINT_LINE
  if (characters && characters.length > 0) {
    userPrompt += `\n\n已确认角色（请根据以下角色设计大纲与冲突）：\n`
    characters.forEach((c) => {
      const parts = [c.name]
      if (c.identity) parts.push(`身份：${c.identity}`)
      if (c.personality) parts.push(`性格：${c.personality}`)
      if (c.goal) parts.push(`目标：${c.goal}`)
      if (c.relationToProtagonist) parts.push(`与主角关系：${c.relationToProtagonist}`)
      if (c.speechStyle) parts.push(`说话风格：${c.speechStyle}`)
      userPrompt += `- ${parts.join('；')}\n`
    })
  }
  userPrompt += `\n请生成共 ${totalChapters} 章的完整大纲，直接输出上述格式的 JSON。`

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      // DeepSeek API 限制 max_tokens 范围为 [1, 8192]
      max_tokens: 8192,
      temperature: 0.7,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let content = message?.content?.trim() || ''
  const reasoningContent = message?.reasoning_content?.trim() || ''

  if (!content && reasoningContent) {
    const jsonMatch = reasoningContent.match(/\{\s*"chapters"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (jsonMatch) content = jsonMatch[0]
    else content = reasoningContent
  }

  if (!content) {
    console.error('[DeepSeek] outline 响应 message:', JSON.stringify(message, null, 2))
    throw new Error('DeepSeek 未返回大纲内容')
  }

  let jsonStr = content
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonStr = codeBlock[1].trim()
  else {
    const embedded = content.match(/\{\s*"chapters"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (embedded) jsonStr = embedded[0]
  }

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('解析大纲结果失败，请重试')
  }

  const rawChapters = parsed?.chapters
  if (!Array.isArray(rawChapters) || rawChapters.length === 0) {
    throw new Error('未得到有效大纲章节，请重试')
  }

  const chapters = rawChapters.slice(0, totalChapters).map((ch, i) => ({
    chapterIndex: Number(ch.chapterIndex) || i + 1,
    title: String(ch.title ?? '').trim() || `第${i + 1}章`,
    goal: String(ch.goal ?? '').trim() || '',
    points: Array.isArray(ch.points) ? ch.points.map((p) => String(p).trim()).filter(Boolean) : [],
  }))

  return { totalChapters: chapters.length, chapters }
}

/** 分批生成大纲中的一段章节，用于长大纲（如 30 章）加速与稳定性；previousChapters 为已生成章节的摘要 [{ chapterIndex, title, goal }] */
export async function generateOutlineBatch({
  title,
  worldBackground,
  genre,
  coreIdea = '',
  oneLinePromise = '',
  optionalTags = [],
  totalChapters,
  characters = [],
  startChapterIndex,
  endChapterIndex,
  previousChapters = [],
  model: modelOverride,
}) {
  const model = resolveModel(modelOverride)
  const systemPrompt = `你是一个小说大纲助手。根据书名与**本书设定**以及已确认角色、前文已生成的大纲，继续生成后续章节大纲，保持剧情连贯。要求：
- 大纲必须严格贴合本书设定与可选标签，不得偏离世界背景、题材与标签约定的风格与爽点；
- 输出一个 JSON 对象，格式为：{"chapters": [{"chapterIndex": 数字, "title": "章标题", "goal": "本章一句话目标", "points": ["要点1","要点2","要点3"]}, ...]}；chapterIndex 从 startChapterIndex 到 endChapterIndex 连续编号；每章必须有 title、goal、points；points 为 3～5 个关键要点；
- 不要输出任何其他文字或 markdown 标记，仅此 JSON。`

  const settingBlock = buildSettingBlock({ worldBackground, genre, coreIdea, oneLinePromise, optionalTags })
  let userPrompt = `书名：${title}\n\n${settingBlock}`
  userPrompt += CONSTRAINT_LINE
  if (characters && characters.length > 0) {
    userPrompt += `\n\n已确认角色：\n`
    characters.forEach((c) => {
      const parts = [c.name]
      if (c.identity) parts.push(`身份：${c.identity}`)
      if (c.personality) parts.push(`性格：${c.personality}`)
      if (c.goal) parts.push(`目标：${c.goal}`)
      if (c.relationToProtagonist) parts.push(`与主角关系：${c.relationToProtagonist}`)
      userPrompt += `- ${parts.join('；')}\n`
    })
  }
  if (previousChapters.length > 0) {
    userPrompt += `\n已生成的前文大纲（请在此基础上延续）：\n`
    previousChapters.forEach((ch) => {
      userPrompt += `第 ${ch.chapterIndex} 章 ${ch.title}：${ch.goal || ''}\n`
    })
  }
  userPrompt += `\n本书共 ${totalChapters} 章。请生成第 ${startChapterIndex} 至 ${endChapterIndex} 章的大纲，直接输出上述格式的 JSON。`

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8192,
      temperature: 0.7,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let content = message?.content?.trim() || ''
  const reasoningContent = message?.reasoning_content?.trim() || ''

  if (!content && reasoningContent) {
    const jsonMatch = reasoningContent.match(/\{\s*"chapters"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (jsonMatch) content = jsonMatch[0]
    else content = reasoningContent
  }

  if (!content) {
    console.error('[DeepSeek] outline batch 响应 message:', JSON.stringify(message, null, 2))
    throw new Error('DeepSeek 未返回大纲内容')
  }

  let jsonStr = content
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonStr = codeBlock[1].trim()
  else {
    const embedded = content.match(/\{\s*"chapters"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (embedded) jsonStr = embedded[0]
  }

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('解析大纲结果失败，请重试')
  }

  const rawChapters = parsed?.chapters || []
  const chapters = rawChapters.map((ch, i) => ({
    chapterIndex: Number(ch.chapterIndex) || startChapterIndex + i,
    title: String(ch.title ?? '').trim() || `第${startChapterIndex + i}章`,
    goal: String(ch.goal ?? '').trim() || '',
    points: Array.isArray(ch.points) ? ch.points.map((p) => String(p).trim()).filter(Boolean) : [],
  }))

  return { chapters }
}

/**
 * 根据书名与设定 AI 推荐主要角色（3～8 人），供用户选用或编辑
 * @param {Object} opts - title, worldBackground, genre, coreIdea?, oneLinePromise?, model?
 * @returns {Array<{ name, identity, personality, goal, relationToProtagonist, speechStyle }>}
 */
export async function suggestCharacters({
  title,
  worldBackground,
  genre,
  coreIdea = '',
  oneLinePromise = '',
  optionalTags = [],
  model: modelOverride,
}) {
  const model = resolveModel(modelOverride)
  const systemPrompt = `你是一个资深网络小说作者/编辑/读者。根据书名与**本书设定**（世界背景、题材、核心创意、一句话承诺、可选标签）生成该小说主要角色列表（3～8 人）。要求：
- 角色身份、性格、目标与关系必须严格贴合本书设定与可选标签，不得出现与设定矛盾的设定；
- 若含可选标签（如系统流、重生、甜宠、逆袭等），角色设定与关系应能支撑这些标签的剧情发展；
- 输出一个 JSON 对象，格式为：{"characters": [{"name": "姓名", "identity": "身份", "personality": "性格", "goal": "目标/动机", "relationToProtagonist": "与主角关系", "speechStyle": "口头禅或说话风格"}, ...]}；每个角色至少包含 name；
- 不要输出任何其他文字或 markdown 标记，仅此 JSON。`

  const settingBlock = buildSettingBlock({ worldBackground, genre, coreIdea, oneLinePromise, optionalTags })
  const userPrompt = `书名：${title}\n\n${settingBlock}\n\n请根据以上设定生成主要角色列表，严格贴合设定与标签，直接输出上述格式的 JSON。`

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let content = message?.content?.trim() || ''
  const reasoningContent = message?.reasoning_content?.trim() || ''

  if (!content && reasoningContent) {
    const jsonMatch = reasoningContent.match(/\{\s*"characters"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (jsonMatch) content = jsonMatch[0]
    else content = reasoningContent
  }

  if (!content) {
    console.error('[DeepSeek] suggestCharacters 响应 message:', JSON.stringify(message, null, 2))
    throw new Error('DeepSeek 未返回角色内容')
  }

  let jsonStr = content
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonStr = codeBlock[1].trim()
  else {
    const embedded = content.match(/\{\s*"characters"\s*:\s*\[[\s\S]*\]\s*\}/)
    if (embedded) jsonStr = embedded[0]
  }

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('解析角色结果失败，请重试')
  }

  const raw = parsed?.characters
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('未得到有效角色列表，请重试')
  }

  return raw.slice(0, 8).map((c) => ({
    name: String(c.name ?? '').trim() || '未命名',
    identity: String(c.identity ?? '').trim(),
    personality: String(c.personality ?? '').trim(),
    goal: String(c.goal ?? '').trim(),
    relationToProtagonist: String(c.relationToProtagonist ?? '').trim(),
    speechStyle: String(c.speechStyle ?? '').trim(),
  }))
}

/**
 * 根据全局设定、角色、本章大纲与前文摘要，生成单章正文
 * @param {Object} opts - title, worldBackground, genre, coreIdea?, oneLinePromise?, characters[], chapterIndex, chapterTitle, chapterGoal, chapterPoints, previousSummary?, wordCount, model?
 * @returns {{ content: string }}
 */
export async function generateChapterContent({
  title,
  worldBackground,
  genre,
  coreIdea = '',
  oneLinePromise = '',
  optionalTags = [],
  characters = [],
  chapterIndex,
  chapterTitle,
  chapterGoal,
  chapterPoints = [],
  previousSummary = '',
  wordCount = 3000,
  model: modelOverride,
}) {
  const model = resolveModel(modelOverride)
  const isFirstChapter = chapterIndex === 1
  const systemPrompt = `你是一位资深网络小说作者/编辑/读者。请根据给定的**全书设定**、角色列表与本章大纲撰写本章正文。要求：
- 正文必须严格贴合【全书设定】与【本章大纲】，不得自创与设定矛盾的设定、词汇或剧情；角色言行必须符合角色设定；
- 若含可选标签，正文中须体现相应元素（如系统流有面板/提示、重生有对未来的利用、甜宠有情感互动、逆袭有成长节奏等），风格与爽点与标签一致；
- 仅输出本章正文内容，不要输出章节标题或「第X章」等标记，不要输出任何解释或备注；
- 尽量达到目标字数（约 ${wordCount} 字），可略多或略少，以自然收尾为准。`

  const settingBlock = buildSettingBlock({ worldBackground, genre, coreIdea, oneLinePromise, optionalTags })
  let userPrompt = `【全书设定（必须严格遵循，不得偏离）】\n书名：${title}\n\n${settingBlock}`
  userPrompt += CONSTRAINT_LINE
  if (characters && characters.length > 0) {
    userPrompt += `\n\n【角色列表】\n`
    characters.forEach((c) => {
      const parts = [c.name]
      if (c.identity) parts.push(`身份：${c.identity}`)
      if (c.personality) parts.push(`性格：${c.personality}`)
      if (c.goal) parts.push(`目标：${c.goal}`)
      if (c.relationToProtagonist) parts.push(`与主角关系：${c.relationToProtagonist}`)
      if (c.speechStyle) parts.push(`说话风格：${c.speechStyle}`)
      userPrompt += `- ${parts.join('；')}\n`
    })
  }

  if (isFirstChapter) {
    userPrompt += `\n【本章大纲】\n第 ${chapterIndex} 章：${chapterTitle}\n本章目标：${chapterGoal}\n关键要点：\n${(chapterPoints || []).map((p) => `- ${p}`).join('\n')}`
    userPrompt += `\n\n【写作要求】本章为第一章，无需衔接前文。紧贴上述本章大纲，减少环境描写与背景铺垫，直接开门写剧情。约 ${wordCount} 字，直接输出正文内容。`
  } else {
    if (previousSummary.trim()) {
      userPrompt += `\n【上一章结尾】\n${previousSummary.trim()}\n`
      userPrompt += `\n请从以上上一章结尾自然衔接写本章开头，避免逻辑断层；本章开头需与上一章结尾在时间、场景、人物状态上连贯。\n`
    }
    userPrompt += `\n【本章大纲】\n第 ${chapterIndex} 章：${chapterTitle}\n本章目标：${chapterGoal}\n关键要点：\n${(chapterPoints || []).map((p) => `- ${p}`).join('\n')}`
    userPrompt += `\n\n请根据上一章结尾与本章大纲撰写正文，约 ${wordCount} 字，直接输出正文内容。`
  }

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8192,
      temperature: 0.8,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let content = message?.content?.trim() || ''
  const reasoningContent = message?.reasoning_content?.trim() || ''

  if (!content && reasoningContent) content = reasoningContent
  if (!content) {
    console.error('[DeepSeek] generateChapterContent 响应 message:', JSON.stringify(message, null, 2))
    throw new Error('DeepSeek 未返回正文内容')
  }

  return { content }
}

/**
 * 根据本章正文生成「本章结尾摘要」，供下一章衔接用；仅分析章节末尾部分以控制 token
 * @param {string} content - 章节正文（可只传末尾约 2500 字）
 * @param {{ chapterIndex?: number, model?: string }} [opts] - chapterIndex 为 1 时使用第一章专用 prompt
 * @returns {Promise<string>} 结尾摘要，约 200～400 字
 */
export async function summarizeChapterEnding(content, opts = {}) {
  if (!content || !content.trim()) return ''
  const model = resolveModel(opts.model)
  const isFirstChapter = opts.chapterIndex === 1
  const tail = content.length > 2600 ? content.slice(-2600) : content
  const systemPrompt = isFirstChapter
    ? `你是一位小说编辑助手。本章为全书第一章。请根据给定的章节正文末尾，用 200～400 字概括本章结尾时的状态，供第二章开头衔接使用。摘要须包含：此时场景与时间、主要人物所在位置与状态、以及留下的悬念或下文伏笔。只输出摘要正文，不要输出「摘要：」等前缀或任何解释。`
    : `你是一位小说编辑助手。请根据给定的章节正文（可能仅为末尾部分），用 200～400 字概括本章结尾，供下一章开头衔接使用。摘要须包含：此时场景与时间、主要人物所在位置与状态、情节收束或留下的悬念。只输出摘要正文，不要输出「摘要：」等前缀或任何解释。`

  const userHint = isFirstChapter ? '（本章为第一章，请概括结尾状态供第二章衔接）' : ''
  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `【章节正文末尾】\n\n${tail}\n\n请概括本章结尾（200～400 字）${userHint}，直接输出摘要。` },
      ],
      max_tokens: 600,
      temperature: 0.3,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let text = (message?.content?.trim() || '').replace(/^摘要[：:]\s*/i, '').trim()
  const reasoning = message?.reasoning_content?.trim()
  if (!text && reasoning) text = reasoning.replace(/^摘要[：:]\s*/i, '').trim()
  return text || ''
}

/**
 * 轻量补全：用上一章末尾约 800 字生成一两句衔接用概括（摘要失败或未保存时使用）
 * @param {string} content - 章节正文（可只传末尾约 800 字）
 * @param {{ model?: string }} [opts]
 * @returns {Promise<string>} 一两句话的结尾概括，供下一章衔接
 */
export async function summarizeChapterEndingFallback(content, opts = {}) {
  if (!content || !content.trim()) return ''
  const model = resolveModel(opts.model)
  const tail = content.length > 900 ? content.slice(-900) : content
  const systemPrompt = `你是一位小说编辑助手。请根据给定的章节正文末尾，用一两句话（约 50～150 字）概括本章结尾：此时场景、主要人物状态、以及留给下文的悬念或收束。供下一章开头衔接用。只输出概括句，不要「概括：」等前缀。`

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `【章节正文末尾】\n\n${tail}\n\n请用一两句话概括本章结尾，直接输出。` },
      ],
      max_tokens: 200,
      temperature: 0.3,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let text = (message?.content?.trim() || '').replace(/^概括[：:]\s*/i, '').trim()
  const reasoning = message?.reasoning_content?.trim()
  if (!text && reasoning) text = reasoning.replace(/^概括[：:]\s*/i, '').trim()
  return text || ''
}

/**
 * 一致性检查：根据项目设定、角色、大纲与已生成正文，检测时间线/人物/与大纲偏离等问题
 * @param {Object} project - 完整项目（setting, title, oneLinePromise, characters, outline, chapters）
 * @param {{ model?: string }} [opts]
 * @returns {{ issues: Array<{ type: string, severity: string, chapterIndex: number, message: string, suggestion?: string }>, status: 'completed' }}
 */
export async function runConsistencyCheck(project, opts = {}) {
  const model = resolveModel(opts.model)
  const systemPrompt = `你是一位小说审读助手，负责检查已写正文与**本书设定**（世界背景、题材、核心创意、一句话承诺、可选标签）、大纲、角色是否一致。以本书设定与标签为唯一基准，正文不得与之矛盾或偏离。
请根据给定的「本书设定」「角色列表」「大纲」以及「各章正文摘要」，找出以下类型的问题：
1. **时间线矛盾**（type: timeline）：前后章节时间顺序、年龄、季节等不一致。
2. **人物行为/性格与设定冲突**（type: character）：角色言行与身份、性格、目标不符，或与角色设定矛盾。
3. **与大纲严重偏离**（type: outline_deviation）：章节目标或关键要点未体现，或剧情走向与大纲冲突。
请仅输出一个 JSON 对象，格式为：{"issues":[{"type":"timeline|character|outline_deviation","severity":"warning|error","chapterIndex":数字,"message":"问题描述","suggestion":"可选修改建议"},...]}
若无问题则输出 {"issues":[]}。不要输出任何其他文字或 markdown。`

  const worldBg = (project.setting?.worldBackground ?? '') + (project.setting?.worldBackgroundSub ? `（${project.setting.worldBackgroundSub}）` : '')
  const settingBlock = buildSettingBlock({
    worldBackground: worldBg,
    genre: project.setting?.genre ?? '',
    coreIdea: project.setting?.coreIdea ?? '',
    oneLinePromise: project.oneLinePromise ?? '',
    optionalTags: project.setting?.optionalTags ?? [],
  })
  let userPrompt = `【书名】${project.title || '未命名'}\n\n${settingBlock}\n\n【角色列表】\n`
  ;(project.characters || []).forEach((c) => {
    userPrompt += `- ${c.name}：${c.identity || ''}；性格：${c.personality || ''}；目标：${c.goal || ''}；与主角关系：${c.relationToProtagonist || ''}\n`
  })

  const outline = project.outline || { chapters: [] }
  const outlineChapters = outline.chapters || []
  // 一致性检查受模型上下文限制，超过此章数只检查最近部分，避免 prompt 超长导致失败
  const MAX_CHAPTERS_FOR_CONSISTENCY = 150
  const chaptersToCheck = outlineChapters.length > MAX_CHAPTERS_FOR_CONSISTENCY
    ? outlineChapters.slice(-MAX_CHAPTERS_FOR_CONSISTENCY)
    : outlineChapters

  userPrompt += `\n【大纲】（共 ${outlineChapters.length} 章，以下仅列出参与本次检查的 ${chaptersToCheck.length} 章）\n`
  chaptersToCheck.forEach((ch) => {
    userPrompt += `第 ${ch.chapterIndex} 章 ${ch.title}：目标 ${ch.goal || ''}；要点：${(ch.points || []).join('、')}\n`
  })

  const chapters = project.chapters || {}
  userPrompt += `\n【各章正文摘要（供检查用）】\n`
  chaptersToCheck.forEach((ch) => {
    const idx = ch.chapterIndex
    const raw = chapters[String(idx)]?.content || ''
    const head = raw.slice(0, 800)
    const tail = raw.length > 1200 ? raw.slice(-400) : ''
    const snippet = tail ? `${head}\n...（中略）...\n${tail}` : head
    userPrompt += `\n--- 第 ${idx} 章 ${ch.title} ---\n${snippet || '（未生成）'}\n`
  })

  userPrompt += `\n请对上述内容做一致性检查，直接输出 JSON。`

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let content = message?.content?.trim() || ''
  const reasoningContent = message?.reasoning_content?.trim() || ''
  if (!content && reasoningContent) content = reasoningContent

  let jsonStr = content
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonStr = codeBlock[1].trim()
  const embedded = content.match(/\{\s*"issues"\s*:\s*\[[\s\S]*\]\s*\}/)
  if (embedded) jsonStr = embedded[0]

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('[DeepSeek] runConsistencyCheck 解析失败', content.slice(0, 500))
    return { issues: [], status: 'completed' }
  }

  const rawIssues = Array.isArray(parsed?.issues) ? parsed.issues : []
  const issues = rawIssues
    .filter((i) => i && Number(i.chapterIndex) >= 1)
    .map((i) => ({
      type: String(i.type || 'other').toLowerCase(),
      severity: String(i.severity || 'warning').toLowerCase(),
      chapterIndex: Number(i.chapterIndex),
      message: String(i.message || ''),
      suggestion: i.suggestion != null ? String(i.suggestion) : undefined,
    }))
  const result = { issues, status: 'completed' }
  if (outlineChapters.length > MAX_CHAPTERS_FOR_CONSISTENCY && chaptersToCheck.length > 0) {
    result.checkedChaptersRange = {
      from: chaptersToCheck[0].chapterIndex,
      to: chaptersToCheck[chaptersToCheck.length - 1].chapterIndex,
      total: outlineChapters.length,
    }
  }
  return result
}

/**
 * 根据项目设定、角色、大纲生成作品简介，与世界观、角色、章节剧情紧密联系
 * @param {Object} project - 完整项目（setting, title, oneLinePromise, characters, outline）
 * @param {{ model?: string }} [opts]
 * @returns {Promise<string>} 简介正文（纯文本，约 200～500 字）
 */
export async function generateSynopsis(project, opts = {}) {
  const model = resolveModel(opts.model)
  const systemPrompt = `你是一位小说简介撰写助手。根据用户提供的「书名」「本书设定」「角色列表」和「章节大纲」，撰写一段作品简介。
要求：
- 简介须与世界观、题材、核心创意、角色设定以及大纲中的剧情走向紧密联系，概括全书核心冲突与看点；
- 长度约 200～500 字，适合作为书城/连载平台的作品简介，吸引读者；
- 只输出简介正文，不要输出「简介：」等前缀或任何 markdown、标题。`

  const worldBg = (project.setting?.worldBackground ?? '') + (project.setting?.worldBackgroundSub ? `（${project.setting.worldBackgroundSub}）` : '')
  const settingBlock = buildSettingBlock({
    worldBackground: worldBg,
    genre: project.setting?.genre ?? '',
    coreIdea: project.setting?.coreIdea ?? '',
    oneLinePromise: project.oneLinePromise ?? '',
    optionalTags: project.setting?.optionalTags ?? [],
  })

  let userPrompt = `【书名】${project.title || '未命名'}\n\n${settingBlock}\n\n【角色列表】\n`
  ;(project.characters || []).forEach((c) => {
    userPrompt += `- ${c.name}：${c.identity || ''}；性格：${c.personality || ''}；目标：${c.goal || ''}；与主角关系：${c.relationToProtagonist || ''}\n`
  })

  const outline = project.outline || { chapters: [] }
  const outlineChapters = outline.chapters || []
  const maxChaptersForSynopsis = 80
  const chaptersToUse = outlineChapters.length > maxChaptersForSynopsis
    ? [...outlineChapters.slice(0, 20), ...outlineChapters.slice(-10)]
    : outlineChapters

  userPrompt += `\n【大纲】（共 ${outlineChapters.length} 章）\n`
  chaptersToUse.forEach((ch) => {
    userPrompt += `第 ${ch.chapterIndex} 章 ${ch.title}：${ch.goal || ''}；要点：${(ch.points || []).slice(0, 3).join('、')}\n`
  })
  if (outlineChapters.length > maxChaptersForSynopsis) {
    userPrompt += `…（中间章节省略）…\n`
  }

  userPrompt += `\n请根据以上内容撰写作品简介，直接输出简介正文。`

  const response = await fetchWithRetry(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.6,
    }),
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message
  let content = message?.content?.trim() || ''
  const reasoningContent = message?.reasoning_content?.trim() || ''
  if (!content && reasoningContent) content = reasoningContent

  if (!content) {
    throw new Error('DeepSeek 未返回简介内容')
  }

  return content.replace(/^[:：]\s*简介\s*[:：]?/i, '').trim()
}
