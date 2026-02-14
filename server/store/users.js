import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { getDataDir } from '../db.js'

const USERS_FILE = path.join(getDataDir(), 'users.json')

/** 用户 ID 格式：4～24 位，字母数字下划线 */
const USER_ID_REG = /^[a-zA-Z0-9_]{4,24}$/

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} [phone]
 * @property {string} [userId] 用户自定义登录 ID
 * @property {string} [passwordHash] 仅密码注册用户存在，格式 salt.hex:derived.hex
 * @property {string} created_at
 * @property {string} updated_at
 */

function loadUsers() {
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

function saveUsers(users) {
  getDataDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2), 'utf8')
}

/**
 * 按手机号查找用户
 * @param {string} phone
 * @returns {User | null}
 */
export function findUserByPhone(phone) {
  if (!phone || typeof phone !== 'string') return null
  const normalized = phone.replace(/\s/g, '')
  if (!normalized.length) return null
  const users = loadUsers()
  return users.find((u) => u.phone === normalized) || null
}

/**
 * 按用户自定义 ID 查找用户
 * @param {string} userId
 * @returns {User | null}
 */
export function findUserByUserId(userId) {
  if (!userId || typeof userId !== 'string') return null
  const normalized = userId.trim()
  if (!normalized.length) return null
  const users = loadUsers()
  return users.find((u) => u.userId && u.userId.toLowerCase() === normalized.toLowerCase()) || null
}

/**
 * 按 id 查找用户
 * @param {string} id
 * @returns {User | null}
 */
export function getUserById(id) {
  if (!id || typeof id !== 'string') return null
  const users = loadUsers()
  return users.find((u) => u.id === id) || null
}

/**
 * 校验用户 ID 格式
 * @param {string} userId
 * @returns {{ ok: true } | { error: string }}
 */
export function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') return { error: '用户 ID 不能为空' }
  const s = userId.trim()
  if (s.length < 4) return { error: '用户 ID 至少 4 个字符' }
  if (s.length > 24) return { error: '用户 ID 最多 24 个字符' }
  if (!USER_ID_REG.test(s)) return { error: '用户 ID 仅支持字母、数字、下划线' }
  return { ok: true }
}

/**
 * 使用手机号创建用户（若已存在则不重复创建）- 供短信登录使用
 * @param {string} phone
 * @returns {User}
 */
export function createUserByPhone(phone) {
  if (!phone || typeof phone !== 'string') throw new Error('手机号无效')
  const normalized = phone.replace(/\s/g, '')
  if (!normalized.length) throw new Error('手机号无效')
  const existing = findUserByPhone(normalized)
  if (existing) return existing
  const now = new Date().toISOString()
  const user = { id: randomUUID(), phone: normalized, created_at: now, updated_at: now }
  const users = loadUsers()
  users.push(user)
  saveUsers(users)
  return user
}

/**
 * 使用用户 ID + 密码哈希创建用户（注册）
 * @param {string} userId 用户自定义 ID
 * @param {string} passwordHash 已哈希后的密码（含 salt，格式 salt.hex:derived.hex）
 * @returns {{ user: User } | { error: string }}
 */
export function createUserWithPassword(userId, passwordHash) {
  const v = validateUserId(userId)
  if (v.error) return { error: v.error }
  const normalized = userId.trim()
  const existing = findUserByUserId(normalized)
  if (existing) return { error: '该用户 ID 已被注册' }
  const now = new Date().toISOString()
  const user = {
    id: randomUUID(),
    userId: normalized,
    passwordHash,
    created_at: now,
    updated_at: now,
  }
  const users = loadUsers()
  users.push(user)
  saveUsers(users)
  return { user }
}
