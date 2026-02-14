import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { getPool } from '../db-mysql.js'

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
 */

export async function readProject(id) {
  if (!id || typeof id !== 'string') return null
  const pool = await getPool()
  if (pool) {
    const [rows] = await pool.query('SELECT data FROM projects WHERE id = ? LIMIT 1', [id])
    const row = rows[0]
    if (!row) return null
    return typeof row.data === 'string' ? JSON.parse(row.data) : row.data
  }
  ensureDataDir()
  const file = projectPath(id)
  if (!fs.existsSync(file)) return null
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    console.error('[store] readProject', id, err)
    return null
  }
}

export async function writeProject(project) {
  if (!project?.id) return
  const pool = await getPool()
  if (pool) {
    const payload = JSON.stringify(project)
    const id = project.id
    const userId = project.userId ?? null
    const createdAt = project.createdAt || project.updatedAt
    const updatedAt = project.updatedAt || project.createdAt
    await pool.query(
      'INSERT INTO projects (id, user_id, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = ?, data = ?',
      [id, userId, createdAt, updatedAt, payload, updatedAt, payload]
    )
    return
  }
  ensureDataDir()
  fs.writeFileSync(projectPath(project.id), JSON.stringify(project, null, 2), 'utf8')
}

export async function listProjects(userId) {
  if (!userId || typeof userId !== 'string') return []
  const pool = await getPool()
  if (pool) {
    const [rows] = await pool.query(
      'SELECT data FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    )
    return rows.map((row) => {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      return {
        id: data?.id || '',
        title: data?.title || '未命名',
        updatedAt: data?.updatedAt || data?.createdAt || '',
      }
    })
  }
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
      //
    }
  }
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return list
}

export async function createProject(payload) {
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
    chapters: {},
  }
  await writeProject(project)
  return project
}
