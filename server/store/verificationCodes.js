import fs from 'fs'
import path from 'path'
import { randomInt } from 'node:crypto'
import { getDataDir } from '../db.js'

const CODES_FILE = path.join(getDataDir(), 'verification_codes.json')
const CODE_LEN = 6
const EXPIRE_MS = 5 * 60 * 1000 // 5 分钟
const COOLDOWN_MS = 60 * 1000 // 同一手机 60 秒内不重复发码

function loadCodes() {
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

function saveCodes(codes) {
  getDataDir()
  fs.writeFileSync(CODES_FILE, JSON.stringify({ codes }, null, 2), 'utf8')
}

/**
 * 生成并存储验证码
 * @param {string} phone
 * @returns {{ code: string, expiresAt: number } | { error: string }}
 */
export function createCode(phone) {
  if (!phone || typeof phone !== 'string') return { error: '手机号无效' }
  const normalized = phone.replace(/\s/g, '')
  if (!normalized.length) return { error: '手机号无效' }

  const now = Date.now()
  const codes = loadCodes()
  const last = codes.filter((c) => c.phone === normalized).sort((a, b) => b.created_at - a.created_at)[0]
  if (last && now - last.created_at < COOLDOWN_MS) {
    return { error: '发送过于频繁，请稍后再试' }
  }

  const code = String(randomInt(0, 10 ** CODE_LEN)).padStart(CODE_LEN, '0')
  const expiresAt = now + EXPIRE_MS
  codes.push({ phone: normalized, code, expires_at: expiresAt, created_at: now })
  saveCodes(codes)
  return { code, expiresAt }
}

/**
 * 校验验证码：正确则删除该码并返回 true
 * @param {string} phone
 * @param {string} code
 * @returns {boolean}
 */
export function verifyCode(phone, code) {
  if (!phone || !code || typeof phone !== 'string' || typeof code !== 'string') return false
  const normalized = phone.replace(/\s/g, '')
  const trimmedCode = code.trim()
  if (!normalized.length || !trimmedCode.length) return false

  const now = Date.now()
  const codes = loadCodes()
  const idx = codes.findIndex(
    (c) => c.phone === normalized && c.code === trimmedCode && c.expires_at > now
  )
  if (idx === -1) return false
  codes.splice(idx, 1)
  saveCodes(codes)
  return true
}
