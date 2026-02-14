# AI 小说生成

基于设定与 AI 生成书名、大纲与章节正文的 Web 应用，当前接入 DeepSeek API。支持按章生成、锁定、一致性检查与导出 TXT，方便后续上传书城。

## 环境要求

- Node.js 18+
- 项目根目录下 `.env` 中配置 `DEEPSEEK_API_KEY`（可复制 `.env.example` 为 `.env` 后填写）

## 本地运行

### 1. 安装依赖

```bash
# 前端
cd web && npm install && cd ..

# 后端（用户与验证码使用 JSON 文件存储，无需原生编译）
cd server && npm install && cd ..
```

### 2. 配置环境变量

在**项目根目录**创建或编辑 `.env`：

- **DEEPSEEK_API_KEY**（必填）：DeepSeek API Key，见 <https://platform.deepseek.com/>
- **PORT**（可选）：后端端口，默认 `3002`
- **JWT_SECRET**（可选）：登录 JWT 签发密钥，默认开发用固定值；生产环境务必设置随机长字符串
- **JWT_EXPIRES_IN**（可选）：Token 有效期，默认 `7d`

前端开发环境（`web/.env.development`）：

- **VITE_API_BASE_URL**（可选）：留空时请求走 Vite 代理到后端，推荐留空；若直连后端可填 `http://localhost:3002`

### 3. 启动服务（需同时运行前端与后端）

```bash
# 终端一：启动后端（默认 http://localhost:3002）
cd server && npm run start

# 终端二：启动前端（默认 http://localhost:5173，会代理 /api 到后端）
cd web && npm run dev
```

浏览器访问前端地址（如 http://localhost:5173）。

### 4. 使用流程简述

1. **首页**：可查看「我的项目」列表，点击某本书进入写作页继续写；或点击「新建小说」从设定开始。
2. **创作设定** → **书名** → **角色设定** → **大纲生成与确认** → **按章生成正文**（可锁定、保存、重写）。
3. **一致性检查**：在写作页点击「发起检查」，查看时间线/人物/大纲偏离等问题并定位到章节。
4. **导出**：选择「全部有正文的章节」或「仅已锁定章节」（可多选章节），点击「导出 TXT」下载。

## 部署上线

要让其他人通过公网访问，请阅读 **[docs/部署上线指南.md](docs/部署上线指南.md)**。

**国内最简单**：使用 **[Zeabur](https://zeabur.com)**（支持国内访问）。把代码推到 GitHub → Zeabur 连接仓库 → 自动按根目录 `zbpack.json` 构建并部署 → 在 Zeabur 里配置环境变量 `DEEPSEEK_API_KEY`、`JWT_SECRET` 即可获得访问链接。

其他方式：单体部署（Railway、Render、fly.io、腾讯云 Cloud Run 等用根目录 `Dockerfile`）；或前后端分离（前端设 `VITE_API_BASE_URL` 后部署到 Vercel/Netlify 等）。

## 自测

后端启动后，在 `server` 目录下执行：

```bash
cd server && npm run test:api
```

将依次校验：健康检查、创建项目、项目列表、锁定章节、导出接口。若全部通过会输出「自测通过」。

**认证接口（用户功能阶段 1）**：`POST /api/auth/send-code`（body: `{ "phone": "13800138000" }`）、`POST /api/auth/login`（body: `{ "phone", "code" }`，返回 `{ user, token }`）、`GET /api/me`（Header: `Authorization: Bearer <token>`）。开发环境下验证码会打印在后端控制台。

## 目录说明

- `web/`：前端（React + Vite + Tailwind）
- `server/`：后端（Node + Express），负责调用 DeepSeek、用户与项目持久化（`data/users.json`、`data/verification_codes.json`、`data/projects/`）、认证（手机号+验证码、JWT）、导出等
- `docs/`：产品文档与接口/状态设计

## 安全说明

- **请勿将 `.env` 或含真实 API Key 的文件提交到 Git**。`.gitignore` 已忽略 `.env`。
- 后续若补充其他 API Key，可在 `.env` 中增加对应变量，并在 `server` 中按需读取。
