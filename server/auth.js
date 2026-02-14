import jwt from 'jsonwebtoken'
import { randomBytes, pbkdf2Sync } from 'node:crypto'
import { createCode, verifyCode } from './store/verificationCodes.js'
import { createUserByPhone, getUserById, findUserByUserId, createUserWithPassword } from './store/users.js'
import { sendVerificationSms } from './sms.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const isDev = process.env.NODE_ENV !== 'production'

const PBKDF2_ITERATIONS = 100000
const KEY_LEN = 64

function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256')
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

function verifyPassword(password, stored) {
  if (!stored || !password) return false
  const [saltHex, derivedHex] = stored.split(':')
  if (!saltHex || !derivedHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256')
  return derived.toString('hex') === derivedHex
}

/**
 * 发送验证码：先入库，再发短信（若已配置阿里云短信）；未配置时开发环境打印到控制台
 * @param {string} phone
 * @returns {Promise<{ success: true } | { error: string }>}
 */
export async function sendVerificationCode(phone) {
  const result = await createCode(phone)
  if (result.error) return result

  const smsResult = await sendVerificationSms(phone, result.code)
  if (smsResult.error) {
    return { error: smsResult.error }
  }
  if (smsResult.skipped && isDev && result.code) {
    console.log(`[auth] 验证码（未配置腾讯云短信，仅开发环境）手机号 ${phone} -> ${result.code}`)
  }
  return { success: true }
}

/**
 * 用户 ID + 密码注册，返回 { user, token }
 * @param {string} userId
 * @param {string} password
 * @returns {{ user: object, token: string } | { error: string }}
 */
export async function registerWithPassword(userId, password) {
  if (!password || typeof password !== 'string') return { error: '请设置密码' }
  if (password.length < 6) return { error: '密码至少 6 位' }
  const hashed = hashPassword(password)
  const result = await createUserWithPassword(userId.trim(), hashed)
  if (result.error) return { error: result.error }
  const user = result.user
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  return {
    user: { id: user.id, userId: user.userId },
    token,
  }
}

/**
 * 用户 ID + 密码登录，返回 { user, token }
 * @param {string} userId
 * @param {string} password
 * @returns {{ user: object, token: string } | { error: string }}
 */
export async function loginWithPassword(userId, password) {
  if (!userId || !password) return { error: '请输入用户 ID 和密码' }
  const user = await findUserByUserId(userId.trim())
  if (!user || !user.passwordHash) return { error: '用户 ID 或密码错误' }
  if (!verifyPassword(password, user.passwordHash)) return { error: '用户 ID 或密码错误' }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  return {
    user: { id: user.id, userId: user.userId },
    token,
  }
}

/**
 * 手机号 + 验证码登录/注册，返回 { user, token }（短信验证通过后使用，当前可保留供后续开通短信用）
 * @param {string} phone
 * @param {string} code
 * @returns {{ user: object, token: string } | { error: string }}
 */
export async function loginWithCode(phone, code) {
  if (!phone || !code) return { error: '请提供手机号和验证码' }
  const ok = await verifyCode(phone, code)
  if (!ok) return { error: '验证码错误或已过期' }
  const user = await createUserByPhone(phone)
  const token = jwt.sign(
    { userId: user.id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
  return {
    user: { id: user.id, phone: user.phone },
    token,
  }
}

/**
 * 从 Authorization: Bearer <token> 解析并校验 JWT，将用户写入 req.user；失败不写 req.user，由路由返回 401
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireAuth(req, res, next) {
  const raw = req.headers.authorization
  const token = raw && raw.startsWith('Bearer ') ? raw.slice(7).trim() : null
  if (!token) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await getUserById(payload.userId)
    if (!user) {
      return res.status(401).json({ error: '用户不存在或已失效' })
    }
    req.user = { id: user.id, phone: user.phone, userId: user.userId }
    next()
  } catch (err) {
    res.status(401).json({ error: '未登录或登录已过期' })
  }
}

/**
 * 可选鉴权：有 token 则解析并设置 req.user，无 token 不报错（用于后续按需限制）
 */
export async function optionalAuth(req, res, next) {
  const raw = req.headers.authorization
  const token = raw && raw.startsWith('Bearer ') ? raw.slice(7).trim() : null
  if (!token) {
    req.user = null
    return next()
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await getUserById(payload.userId)
    req.user = user ? { id: user.id, phone: user.phone, userId: user.userId } : null
  } catch {
    req.user = null
  }
  next()
}
