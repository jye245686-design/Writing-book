/** 与 AuthContext 中一致，用于请求头携带 token */
const AUTH_TOKEN_KEY = 'auth_token'

/**
 * API 基地址：开发环境建议留空，走 Vite 代理到后端，避免请求到错误进程导致 404。
 * 若设置 VITE_API_BASE_URL（如 http://localhost:3002），则直接请求该地址。
 * 返回时已去掉末尾斜杠，拼接路径时不会出现双斜杠。
 */
export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string) ?? ''
  return raw.replace(/\/$/, '')
}

/** 获取带登录 token 的请求头，用于需鉴权的接口 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/** 拼接 API 完整 URL，保证 path 以 / 开头且 base 末尾无斜杠，避免出现 //api 导致代理不匹配、404 */
export function apiUrl(path: string): string {
  const base = getApiBase() || (typeof window !== 'undefined' ? window.location.origin : '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!base) return (normalizedPath === '/' || path === '') ? '' : normalizedPath
  return base.replace(/\/$/, '') + normalizedPath
}
