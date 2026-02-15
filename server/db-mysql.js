/**
 * MySQL 连接与建表。
 * 支持 Zeabur 内网、PlanetScale（DATABASE_URL + SSL）、自建 MySQL。
 * 未配置时 getPool() 返回 null，store 层回退到 JSON 文件。
 */
import mysql from 'mysql2/promise'

let pool = null

function getConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL
  if (url && url.startsWith('mysql')) return { url }
  const host = process.env.MYSQL_HOST || process.env.MYSQLHOST
  const user = process.env.MYSQL_USER || process.env.MYSQLUSER
  const password = process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD
  const database = process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'writing_book'
  const port = process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306
  if (!host || !user || !password) return null
  return { host, user, password, database, port }
}

/** 是否使用 DATABASE_URL（PlanetScale 等托管库已自带库，无需 CREATE DATABASE） */
function isUrlConfig(config) {
  return !!config.url
}

/** 若数据库不存在则创建（仅建库不建表）。Zeabur 等自建 MySQL 用；PlanetScale 用 URL 时跳过。 */
async function ensureDatabase(config) {
  if (isUrlConfig(config)) return
  const host = config.host
  const port = Number(config.port) || 3306
  const conn = await mysql.createConnection({
    host,
    port,
    user: config.user,
    password: config.password,
  })
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``)
  } finally {
    await conn.end()
  }
}

/** 托管 MySQL（如 PlanetScale）需 SSL，本地可关 */
function getSslOption() {
  if (process.env.MYSQL_SSL === '0' || process.env.MYSQL_SSL === 'false') return undefined
  return { rejectUnauthorized: true }
}

/**
 * @returns {Promise<import('mysql2/promise').Pool | null>}
 */
export async function getPool() {
  if (pool) return pool
  const config = getConfig()
  if (!config) return null
  try {
    await ensureDatabase(config)
    const ssl = getSslOption()
    if (config.url) {
      pool = mysql.createPool({
        uri: config.url,
        waitForConnections: true,
        connectionLimit: 10,
        ...(ssl && { ssl }),
      })
    } else {
      pool = mysql.createPool({
        host: config.host,
        port: Number(config.port) || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
        ...(ssl && { ssl }),
      })
    }
    await pool.query('SELECT 1')
    return pool
  } catch (err) {
    console.error('[db-mysql] 连接失败:', err.message)
    pool = null
    return null
  }
}

/** 建表（idempotent） */
export async function ensureSchema() {
  const p = await getPool()
  if (!p) return
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(24) NULL UNIQUE,
      phone VARCHAR(20) NULL UNIQUE,
      password_hash VARCHAR(255) NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_phone (phone),
      INDEX idx_expires (expires_at)
    )
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      data JSON NOT NULL,
      INDEX idx_user_id (user_id)
    )
  `)
}
