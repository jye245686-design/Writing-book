import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { getDataDir } from '../db.js'

const USERS_FILE = path.join(getDataDir(), 'users.json')

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} phone
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
 * 使用手机号创建用户（若已存在则不重复创建）
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
