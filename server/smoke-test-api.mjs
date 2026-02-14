#!/usr/bin/env node
/**
 * 自测：健康检查、创建项目、项目列表、锁定章节、导出。
 * 用法：先在一终端运行 npm run start，再在另一终端运行 npm run test:api（在 server 目录下）。
 * 后端默认端口 3002；若修改了 .env 中 PORT，运行 test:api 时需传相同 PORT，如 PORT=3003 npm run test:api。
 */
const PORT = process.env.PORT || 3002
const base = `http://127.0.0.1:${PORT}`

async function main() {
  let res
  try {
    res = await fetch(`${base}/api/health`)
    if (!res.ok) throw new Error(`health: ${res.status}`)
  } catch (e) {
    console.error('请先启动后端：cd server && npm run start')
    process.exit(1)
  }

  const body = {
    setting: { worldBackground: '测试', genre: '测试', coreIdea: '' },
    title: '测试书名',
    outline: {
      totalChapters: 1,
      chapters: [{ chapterIndex: 1, title: '第一章', goal: '目标', points: ['要点1'] }],
    },
  }

  res = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status !== 201) {
    const text = await res.text()
    console.error('POST /api/projects 期望 201，实际:', res.status, text.slice(0, 200))
    process.exit(1)
  }
  const data = await res.json().catch(() => ({}))
  if (!data.id) {
    console.error('响应缺少 id')
    process.exit(1)
  }
  const projectId = data.id
  console.log('POST /api/projects 201，项目 id:', projectId)

  res = await fetch(`${base}/api/projects`)
  if (!res.ok) {
    console.error('GET /api/projects 期望 200，实际:', res.status)
    process.exit(1)
  }
  const listData = await res.json().catch(() => ({}))
  if (!Array.isArray(listData.projects) || !listData.projects.some((p) => p.id === projectId)) {
    console.error('GET /api/projects 列表未包含刚创建的项目')
    process.exit(1)
  }
  console.log('GET /api/projects 列表通过')

  res = await fetch(`${base}/api/projects/${projectId}/chapters/1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '测试正文内容', status: 'locked' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('PATCH /api/projects/:id/chapters/1 期望 200，实际:', res.status, err)
    process.exit(1)
  }
  console.log('PATCH 锁定章节通过')

  res = await fetch(`${base}/api/projects/${projectId}/export?format=txt&scope=locked`)
  if (!res.ok) {
    const err = await res.text()
    console.error('GET /api/projects/:id/export 期望 200，实际:', res.status, err.slice(0, 150))
    process.exit(1)
  }
  const txt = await res.text()
  if (!txt.includes('测试书名') || !txt.includes('测试正文内容')) {
    console.error('导出内容不符合预期')
    process.exit(1)
  }
  console.log('GET 导出 TXT 通过')

  console.log('自测通过：健康检查、创建项目、项目列表、锁定章节、导出')
}

main()
