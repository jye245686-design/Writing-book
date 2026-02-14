import fs from 'fs'
import path from 'path'
import { randomInt } from 'node:crypto'
import { getDataDir } from '../db.js'
import { getPool } from '../db-mysql.js'

const CODES_FILE = path.join(getDataDir(), 'verification_codes.json')
const CODE_LEN = 6
const EXPIRE_MS = 5 * 60 * 1000
const COOLDOWN_MS = 60 * 1000

function loadCodesSync() {
  getDataDir()
  if (!fs.existsSync(CODES_FILE)) return []
  try {
    const raw = fs.readFileSync(CODES_FILE, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.codes) ? data.codes : []
  } catch {
    return []
  }
}

function saveCodesSync(codes) {
  getDataDir()
  fs.writeFileSync(CODES_FILE, JSON.stringify({ codes }, null, 2), 'utf8')
}

export async function createCode(phone) {
  if (!phone || typeof phone !== 'string') return { error: '手机号无效' }
  const normalized = phone.replace(/\s/g, '')
  if (!normalized.length) return { error: '手机号无效' }

  const now = Date.now()
  const pool = await getPool()
  if (pool) {
    const [lastRows] = await pool.query(
      'SELECT created_at FROM verification_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1',
      [normalized]
    )
    const last = lastRows[0]
    if (last && now - Number(last.created_at) < COOLDOWN_MS) {
      return { error: '发送过于频繁，请稍后再试' }
    }
    const code = String(randomInt(0, 10 ** CODE_LEN)).padStart(CODE_LEN, '0')
    const expiresAt = now + EXPIRE_MS
    await pool.query(
      'INSERT INTO verification_codes (phone, code, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [normalized, code, expiresAt, now]
    )
    return { code, expiresAt }
  }

  const codes = loadCodesSync()
  const last = codes.filter((c) => c.phone === normalized).sort((a, b) => b.created_at - a.created_at)[0]
  if (last && now - last.created_at < COOLDOWN_MS) {
    return { error: '发送过于频繁，请稍后再试' }
  }
  const code = String(randomInt(0, 10 ** CODE_LEN)).padStart(CODE_LEN, '0')
  const expiresAt = now + EXPIRE_MS
  codes.push({ phone: normalized, code, expires_at: expiresAt, created_at: now })
  saveCodesSync(codes)
  return { code, expiresAt }
}

export async function verifyCode(phone, code) {
  if (!phone || !code || typeof phone !== 'string' || typeof code !== 'string') return false
  const normalized = phone.replace(/\s/g, '')
  const trimmedCode = code.trim()
  if (!normalized.length || !trimmedCode.length) return false

  const now = Date.now()
  const pool = await getPool()
  if (pool) {
    const [rows] = await pool.query(
      'SELECT id FROM verification_codes WHERE phone = ? AND code = ? AND expires_at > ? LIMIT 1',
      [normalized, trimmedCode, now]
    )
    if (rows.length === 0) return false
    await pool.query('DELETE FROM verification_codes WHERE id = ?', [rows[0].id])
    return true
  }

  const codes = loadCodesSync()
  const idx = codes.findIndex(
    (c) => c.phone === normalized && c.code === trimmedCode && c.expires_at > now
  )
  if (idx === -1) return false
  codes.splice(idx, 1)
  saveCodesSync(codes)
  return true
}
