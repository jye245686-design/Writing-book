import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'projects')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function projectPath(id) {
  return path.join(DATA_DIR, `${id}.json`)
}

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} [userId] - 所属用户 id，无则视为旧数据（列表按用户过滤时不展示）
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {{ worldBackground: string, genre: string, coreIdea: string }} setting
 * @property {string} title
 * @property {string} oneLinePromise
 * @property {Array} characters
 * @property {{ totalChapters: number, chapters: Array }} outline
 * @property {Record<string, { content: string, wordCount: number, status: string, summary?: string }>} chapters
 * @property {{ projectId: string, checkedAt: string, issues: Array<{ type: string, severity: string, chapterIndex: number, message: string, suggestion?: string }>, status: string }} [consistencyReport]
 */

/**
 * @param {string} id
 * @returns {Project | null}
 */
export function readProject(id) {
  if (!id || typeof id !== 'string') return null
  ensureDataDir()
  const file = projectPath(id)
  if (!fs.existsSync(file)) return null
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw)
    return data
  } catch (err) {
    console.error('[store] readProject', id, err)
    return null
  }
}

/**
 * @param {Project} project
 */
export function writeProject(project) {
  if (!project?.id) return
  ensureDataDir()
  const file = projectPath(project.id)
  fs.writeFileSync(file, JSON.stringify(project, null, 2), 'utf8')
}

/**
 * 列出指定用户的项目（仅 id、title、updatedAt）
 * @param {string} userId - 用户 id，仅返回 project.userId === userId 的项目；无 userId 的旧文件不返回
 * @returns {Array<{ id: string, title: string, updatedAt: string }>}
 */
export function listProjects(userId) {
  if (!userId || typeof userId !== 'string') return []
  ensureDataDir()
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))
  const list = []
  for (const f of files) {
    const id = f.replace(/\.json$/, '')
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf8')
      const data = JSON.parse(raw)
      if (data.userId !== userId) continue
      list.push({
        id: data.id || id,
        title: data.title || '未命名',
        updatedAt: data.updatedAt || data.createdAt || '',
      })
    } catch {
      // 解析失败或无 userId 的跳过
    }
  }
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return list
}

/**
 * 创建新项目并持久化
 * @param {Object} payload - setting, title?, oneLinePromise?, characters?, outline, userId
 * @returns {Project}
 */
export function createProject(payload) {
  const now = new Date().toISOString()
  const project = {
    id: randomUUID(),
    userId: payload.userId ?? null,
    createdAt: now,
    updatedAt: now,
    setting: payload.setting ?? { worldBackground: '', genre: '', coreIdea: '' },
    title: payload.title ?? '',
    oneLinePromise: payload.oneLinePromise ?? '',
    characters: Array.isArray(payload.characters) ? payload.characters : [],
    outline: payload.outline ?? { totalChapters: 0, chapters: [] },
    chapters: {}, // { [chapterIndex]: { content, wordCount, status, summary? } }
  }
  writeProject(project)
  return project
}
