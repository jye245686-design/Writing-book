import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { getDataDir } from '../db.js'
import { getPool } from '../db-mysql.js'

const USERS_FILE = path.join(getDataDir(), 'users.json')
const USER_ID_REG = /^[a-zA-Z0-9_]{4,24}$/

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} [phone]
 * @property {string} [userId]
 * @property {string} [passwordHash]
 * @property {string} created_at
 * @property {string} updated_at
 */

function loadUsersSync() {
  getDataDir()
  if (!fs.existsSync(USERS_FILE)) return []
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.users) ? data.users : []
  } catch {
    return []
  }
}

function saveUsersSync(users) {
  getDataDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8')
}

function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    phone: row.phone || undefined,
    userId: row.user_id || undefined,
    passwordHash: row.password_hash || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function findUserByPhone(phone) {
  if (!phone || typeof phone !== 'string') return null
  const normalized = phone.replace(/\s/g, '')
  if (!normalized.length) return null
  const pool = await getPool()
  if (pool) {
    const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? LIMIT 1', [normalized])
    return rowToUser(rows[0] || null)
  }
  const users = loadUsersSync()
  return users.find((u) => u.phone === normalized) || null
}

export async function findUserByUserId(userId) {
  if (!userId || typeof userId !== 'string') return null
  const normalized = userId.trim()
  if (!normalized.length) return null
  const pool = await getPool()
  if (pool) {
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(user_id) = LOWER(?) LIMIT 1', [normalized])
    return rowToUser(rows[0] || null)
  }
  const users = loadUsersSync()
  return users.find((u) => u.userId && u.userId.toLowerCase() === normalized.toLowerCase()) || null
}

export async function getUserById(id) {
  if (!id || typeof id !== 'string') return null
  const pool = await getPool()
  if (pool) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id])
    return rowToUser(rows[0] || null)
  }
  const users = loadUsersSync()
  return users.find((u) => u.id === id) || null
}

export function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') return { error: '用户 ID 不能为空' }
  const s = userId.trim()
  if (s.length < 4) return { error: '用户 ID 至少 4 个字符' }
  if (s.length > 24) return { error: '用户 ID 最多 24 个字符' }
  if (!USER_ID_REG.test(s)) return { error: '用户 ID 仅支持字母、数字、下划线' }
  return { ok: true }
}

export async function createUserByPhone(phone) {
  if (!phone || typeof phone !== 'string') throw new Error('手机号无效')
  const normalized = phone.replace(/\s/g, '')
  if (!normalized.length) throw new Error('手机号无效')
  const existing = await findUserByPhone(normalized)
  if (existing) return existing
  const now = new Date().toISOString()
  const user = { id: randomUUID(), phone: normalized, created_at: now, updated_at: now }
  const pool = await getPool()
  if (pool) {
    await pool.query(
      'INSERT INTO users (id, phone, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [user.id, user.phone, user.created_at, user.updated_at]
    )
    return user
  }
  const users = loadUsersSync()
  users.push(user)
  saveUsersSync(users)
  return user
}

export async function createUserWithPassword(userId, passwordHash) {
  const v = validateUserId(userId)
  if (v.error) return { error: v.error }
  const normalized = userId.trim()
  const existing = await findUserByUserId(normalized)
  if (existing) return { error: '该用户 ID 已被注册' }
  const now = new Date().toISOString()
  const user = {
    id: randomUUID(),
    userId: normalized,
    passwordHash,
    created_at: now,
    updated_at: now,
  }
  const pool = await getPool()
  if (pool) {
    await pool.query(
      'INSERT INTO users (id, user_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [user.id, user.userId, user.passwordHash, user.created_at, user.updated_at]
    )
    return { user }
  }
  const users = loadUsersSync()
  users.push(user)
  saveUsersSync(users)
  return { user }
}
