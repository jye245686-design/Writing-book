import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, 'data')

/**
 * 确保 data 目录存在（用户与验证码使用 JSON 文件存储，无需原生 SQLite）
 * @returns {string} data 目录路径
 */
export function getDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  return DATA_DIR
}
