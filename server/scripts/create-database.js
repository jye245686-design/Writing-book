/**
 * 一次性脚本：在 MySQL 中创建 writing_book 数据库（用于 Zeabur 等未在控制台建库的场景）
 * 用法：在项目根目录配置 .env 中的 MYSQL_* 或 DATABASE_URL（公网连接时用 MYSQL_HOST=公网IP MYSQL_PORT=公网端口）
 * 然后：cd server && node scripts/create-database.js
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })

const DB_NAME = process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'writing_book'

async function main() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL
  let conn

  if (url && url.startsWith('mysql')) {
    const u = new URL(url)
    conn = await mysql.createConnection({
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: u.username,
      password: u.password,
      multipleStatements: true,
    })
  } else {
    const host = process.env.MYSQL_HOST || process.env.MYSQLHOST
    const user = process.env.MYSQL_USER || process.env.MYSQLUSER
    const password = process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD
    const port = process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306
    if (!host || !user || !password) {
      console.error('请配置 .env：MYSQL_HOST、MYSQL_USER、MYSQL_PASSWORD（公网连接时 MYSQL_HOST=公网IP, MYSQL_PORT=公网端口）')
      process.exit(1)
    }
    conn = await mysql.createConnection({
      host,
      port: Number(port) || 3306,
      user,
      password,
      multipleStatements: true,
    })
  }

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``)
    console.log(`数据库 ${DB_NAME} 已创建或已存在。`)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
