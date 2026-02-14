import jwt from 'jsonwebtoken'
import { createCode, verifyCode } from './store/verificationCodes.js'
import { createUserByPhone, getUserById } from './store/users.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const isDev = process.env.NODE_ENV !== 'production'

/**
 * 发送验证码
 * @param {string} phone
 * @returns {{ success: true } | { error: string }}
 */
export function sendVerificationCode(phone) {
  const result = createCode(phone)
  if (result.error) return result
  // 开发环境将验证码打印到控制台，生产环境需接入短信服务（阿里云/腾讯云等）
  if (isDev && result.code) {
    console.log(`[auth] 验证码（仅开发环境）手机号 ${phone} -> ${result.code}`)
  }
  return { success: true }
}

/**
 * 手机号 + 验证码登录/注册，返回 { user, token }
 * @param {string} phone
 * @param {string} code
 * @returns {{ user: object, token: string } | { error: string }}
 */
export function loginWithCode(phone, code) {
  if (!phone || !code) return { error: '请提供手机号和验证码' }
  if (!verifyCode(phone, code)) return { error: '验证码错误或已过期' }
  const user = createUserByPhone(phone)
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
export function requireAuth(req, res, next) {
  const raw = req.headers.authorization
  const token = raw && raw.startsWith('Bearer ') ? raw.slice(7).trim() : null
  if (!token) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = getUserById(payload.userId)
    if (!user) {
      return res.status(401).json({ error: '用户不存在或已失效' })
    }
    req.user = { id: user.id, phone: user.phone }
    next()
  } catch (err) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }
}

/**
 * 可选鉴权：有 token 则解析并设置 req.user，无 token 不报错（用于后续按需限制）
 */
export function optionalAuth(req, res, next) {
  const raw = req.headers.authorization
  const token = raw && raw.startsWith('Bearer ') ? raw.slice(7).trim() : null
  if (!token) {
    req.user = null
    return next()
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = getUserById(payload.userId)
    req.user = user ? { id: user.id, phone: user.phone } : null
  } catch {
    req.user = null
  }
  next()
}
