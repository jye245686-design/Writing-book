# AI 小说生成 - 接口与状态设计

**版本**：v1.2  
**更新日期**：2025-02-14  
**配套文档**：《产品文档-AI小说生成流程.md》  
**说明**：本文档定义创作流程的状态机、数据模型与接口规范，供前后端开发与后续 App 互通使用。

**变更说明（v1.1）**：流程顺序调整为「书名 → 角色设定 → 大纲生成」；状态机与接口清单中的阶段顺序已同步，角色相关接口置于大纲之前。

**变更说明（v1.2）**：新增 2.7 一致性检查结果字段 `checkedChaptersRange`；新增「3.x 1000 章上限与一致性检查范围」说明。

---

## 一、状态机设计

### 1.1 创作项目（Book/Novel）整体状态

一个「一本书」的创作生命周期如下，状态单向为主，部分可回退。（**v1.1**：角色确认先于大纲确认。）

```
  ┌─────────────┐
  │  draft      │  仅保存了设定（背景+题材），未生成书名
  └──────┬──────┘
         │ 生成并确定书名
         ▼
  ┌─────────────┐
  │  title_set  │  书名已定，可进入角色设定
  └──────┬──────┘
         │ 用户添加/编辑并确认角色
         ▼
  ┌─────────────┐
  │ characters_ok│  角色已确认，可生成/编辑/确认大纲
  └──────┬──────┘
         │ 生成并确认大纲
         ▼
  ┌─────────────┐
  │ outline_ok  │  大纲已确认，可开始按章生成
  └──────┬──────┘
         │ 开始生成第一章
         ▼
  ┌─────────────┐    生成/锁定更多章节
  │  writing    │ ◄──────────────────┐
  └──────┬──────┘                    │
         │ 全部章节生成完毕（可选：触发一致性检查）
         ▼
  ┌─────────────┐
  │  checking   │  一致性检查中（可选状态）
  └──────┬──────┘
         │ 检查完成
         ▼
  ┌─────────────┐
  │  completed  │  可导出；用户仍可编辑/重写章节后再次检查
  └─────────────┘
```

| 状态码           | 说明 |
|------------------|------|
| `draft`          | 草稿：仅有世界背景、题材等设定，未定书名。 |
| `title_set`      | 书名已定，可进入角色设定（添加/编辑/确认角色）。 |
| `characters_ok`  | 角色已确认，可生成/编辑/确认大纲。 |
| `outline_ok`     | 大纲已确认，可按章生成正文。 |
| `writing`        | 正在按章生成或编辑正文；至少有一章已生成。 |
| `checking`       | 正在进行一致性检查（可选）。 |
| `completed`      | 全书生成完毕，可导出；允许再次编辑与再次检查。 |

**回退规则**（建议）：

- `title_set` → `draft`：清空书名，重新生成书名。
- `characters_ok` → `title_set`：返回修改书名或重新进入角色设定（清空当前角色列表由产品决定）。
- `outline_ok` → `characters_ok`：重新生成大纲（清空当前大纲）。
- `writing` / `completed`：不自动回退状态；用户可任意编辑内容，仅「再次检查」时进入 `checking`，检查结束后回到 `writing` 或 `completed`。

### 1.2 单章（Chapter）状态

| 状态码       | 说明 |
|--------------|------|
| `pending`    | 未生成，仅有大纲中的 brief。 |
| `generating` | 正在生成正文。 |
| `draft`      | 已生成，未锁定，可重写或自动参与上下文。 |
| `locked`     | 已锁定，仅支持手动编辑，不参与后续章节的「自动重写」。 |

流转：`pending` → `generating` → `draft` →（用户锁定）→ `locked`。锁定后可解锁回 `draft`。

---

## 二、数据模型

### 2.1 创作项目（Project / Book）

用于唯一标识「一本书」，与产品文档中的「创作项目」一一对应。

| 字段            | 类型     | 说明 |
|-----------------|----------|------|
| `id`            | string   | 唯一 ID（建议 UUID）。 |
| `userId`        | string   | 所属用户（预留，未登录可为空或临时 ID）。 |
| `status`        | string   | 见 1.1 状态码。 |
| `createdAt`     | string   | ISO 8601。 |
| `updatedAt`     | string   | ISO 8601。 |
| `title`         | string   | 最终书名（确定后写入）。 |
| `oneLinePromise`| string   | 可选，全书一句话承诺。 |

### 2.2 创作设定（Setting）

对应「阶段 0」：世界背景、题材、核心创意。

| 字段           | 类型   | 说明 |
|----------------|--------|------|
| `worldBackground` | string | 世界背景（如古代/末世/星际）。 |
| `genre`        | string | 题材（如玄幻/言情/悬疑）。 |
| `coreIdea`     | string | 可选，核心创意或一句话梗概。 |

与 Project 关系：1:1，可内嵌在 Project 或单独表/文档存储，由 `projectId` 关联。

### 2.3 大纲（Outline）

对应「阶段 3」（v1.1：在角色确认之后生成），一本书一份大纲。

| 字段     | 类型   | 说明 |
|----------|--------|------|
| `projectId` | string | 所属项目 ID。 |
| `totalChapters` | number | 总章节数。 |
| `chapters` | array  | 见 2.4 大纲章。 |
| `volumes` | array  | 可选，分卷信息，如 `[{ volumeIndex, title, chapterFrom, chapterTo }]`。 |

### 2.4 大纲章（OutlineChapter）

| 字段        | 类型   | 说明 |
|-------------|--------|------|
| `chapterIndex` | number | 章节序号（从 1 开始）。 |
| `title`     | string | 章标题。 |
| `goal`      | string | 本章一句话目标。 |
| `points`    | string[] | 3～5 个关键要点。 |

### 2.5 角色设定（Character）

对应「阶段 2」（v1.1：在书名确认之后、大纲生成之前由用户填写或确认），一本书多角色。用户可完全自定义，或先通过「AI 推荐角色」再编辑。

| 字段         | 类型   | 说明 |
|--------------|--------|------|
| `id`         | string | 角色唯一 ID。 |
| `projectId`  | string | 所属项目 ID。 |
| `name`       | string | 姓名。 |
| `identity`   | string | 身份。 |
| `personality`| string | 性格。 |
| `goal`       | string | 目标/动机。 |
| `relationToProtagonist` | string | 与主角关系。 |
| `speechStyle`| string | 口头禅/说话风格。 |
| `extra`      | string | 其他备注。 |

### 2.6 章节正文（Chapter）

对应「阶段 4」单章内容。

| 字段           | 类型   | 说明 |
|----------------|--------|------|
| `id`           | string | 章节唯一 ID。 |
| `projectId`    | string | 所属项目 ID。 |
| `chapterIndex` | number | 章节序号（与大纲一致）。 |
| `status`       | string | 见 1.2：pending/generating/draft/locked。 |
| `title`        | string | 章标题（可与大纲同步）。 |
| `goal`         | string | 本章一句话目标（来自大纲）。 |
| `points`       | string[] | 本章要点（来自大纲）。 |
| `content`      | string | 正文内容。 |
| `wordCount`    | number | 用户设定的本章字数（目标）。 |
| `summary`      | string | 前文/本章摘要（用于下一章生成，可由后端生成并缓存）。 |
| `createdAt`    | string | ISO 8601。 |
| `updatedAt`    | string | ISO 8601。 |

### 2.7 一致性检查结果（ConsistencyReport）

对应「阶段 5」。

| 字段         | 类型   | 说明 |
|--------------|--------|------|
| `projectId`  | string | 所属项目 ID。 |
| `checkedAt`  | string | ISO 8601。 |
| `issues`     | array  | 见 2.8。 |
| `status`     | string | running / completed / failed。 |
| `checkedChaptersRange` | object | **可选**。当全书章数超过 150 时，一致性检查仅针对最近 150 章，此处为本次检查范围：`{ from: number, to: number, total: number }`（from/to 为章节序号，total 为全书总章数）。前端可展示「本次检查第 X–Y 章（全书共 Z 章）」。 |

### 2.8 一致性问题项（ConsistencyIssue）

| 字段          | 类型   | 说明 |
|---------------|--------|------|
| `type`        | string | 如 timeline / character / outline_deviation。 |
| `severity`    | string | 如 warning / error。 |
| `chapterIndex`| number | 涉及章节。 |
| `position`    | object | 可选，如 { startOffset, endOffset } 或段落索引。 |
| `message`     | string | 问题描述。 |
| `suggestion`  | string | 可选，修改建议。 |

---

## 三、接口清单（REST 风格）

基础路径假设：`/api`。所有需要写操作的接口建议带鉴权（如 Bearer Token），未登录时可用临时身份（后续与 App 统一）。

### 3.1 项目与设定

| 说明           | Method | Path | 说明 |
|----------------|--------|------|------|
| 创建项目       | POST   | /api/projects | 创建新书，body 含 Setting（worldBackground, genre, coreIdea）。 |
| **获取项目列表（已实现）** | GET | **/api/projects** | 返回 { projects: [{ id, title, updatedAt }] }，按 updatedAt 倒序；用于首页「我的项目」。 |
| 获取项目列表（分页） | GET    | /api/projects | 分页、筛选（如 status）为后续扩展。 |
| 获取项目详情   | GET    | /api/projects/:id | 含 Setting、当前 status。 |
| 更新设定       | PATCH  | /api/projects/:id/setting | 仅更新世界背景、题材、核心创意。 |
| 更新项目状态与书名 | PATCH | /api/projects/:id | 更新 title、oneLinePromise、status。 |

### 3.2 书名

| 说明           | Method | Path | 说明 |
|----------------|--------|------|------|
| 生成候选书名   | POST   | /api/projects/:id/titles/suggest | body 可选覆盖 setting；返回 candidates: string[]。 |
| 确定书名       | POST   | /api/projects/:id/title/confirm | body: { title, oneLinePromise? }；可选生成一句话承诺并写入。 |

### 3.3 角色设定（先于大纲，v1.1）

| 说明           | Method | Path | 说明 |
|----------------|--------|------|------|
| 获取角色列表   | GET    | /api/projects/:id/characters | 返回 Character[]。 |
| 更新角色       | PUT    | /api/projects/:id/characters | body: Character[]；用户添加/编辑/删除后保存。 |
| 确认角色       | POST   | /api/projects/:id/characters/confirm | 将项目状态置为 characters_ok，允许进入大纲生成。 |
| **AI 推荐角色（已实现）** | POST | **/api/ai/characters/suggest** | body: title, worldBackground, genre, coreIdea?, oneLinePromise?；返回 { characters: Character[] }，当前端无 projectId 时直接调用此 AI 接口。 |

### 3.4 大纲

| 说明           | Method | Path | 说明 |
|----------------|--------|------|------|
| **生成大纲（已实现）** | POST | **/api/ai/outline/generate** | body: title, worldBackground, genre, coreIdea?, oneLinePromise?, **totalChapters**, **characters**（已确认角色列表）；AI 提示词已强调「根据下列角色设计章节与冲突」，返回 { totalChapters, chapters }。 |
| 获取大纲       | GET    | /api/projects/:id/outline | 返回 Outline。 |
| 更新大纲       | PUT    | /api/projects/:id/outline | body: 完整 Outline；支持单章编辑或整份替换。 |
| 确认大纲       | POST   | /api/projects/:id/outline/confirm | 将项目状态置为 outline_ok。 |

### 3.5 章节正文

| 说明           | Method | Path | 说明 |
|----------------|--------|------|------|
| **创建项目（已实现）** | POST | **/api/projects** | body: setting, title?, oneLinePromise?, characters?, outline；持久化到 server/data/projects/:id.json；返回完整 Project。 |
| **获取项目（已实现）** | GET | **/api/projects/:id** | 返回完整 Project（含 chapters）。 |
| **更新项目（已实现）** | PATCH | **/api/projects/:id** | body: setting?, title?, oneLinePromise?, characters?, outline?。 |
| **生成单章正文（已实现，有状态）** | POST | **/api/projects/:id/chapters/:chapterIndex/generate** | body: { wordCount }；从项目读上下文与前文摘要，调用 AI，写入本章并持久化；返回 { content, chapterIndex, wordCount, status }。 |
| **更新章节（已实现）** | PATCH | **/api/projects/:id/chapters/:chapterIndex** | body: { content?, status? }；支持保存正文、锁定。 |
| **生成单章正文（无状态，保留）** | POST | **/api/ai/chapters/generate** | body: title, worldBackground, genre, ...；客户端带齐上下文；返回 { content }。 |
| 获取章节列表   | GET    | /api/projects/:id/chapters | 返回 Chapter[]（含 status、title、wordCount、summary）。 |
| 获取单章       | GET    | /api/projects/:id/chapters/:chapterIndex | 或按 chapterId 查。 |
| 生成单章正文   | POST   | /api/projects/:id/chapters/:chapterIndex/generate | body: { wordCount }；返回生成后的 Chapter（有项目持久化时使用）。 |
| 更新单章       | PATCH  | /api/projects/:id/chapters/:chapterIndex | body: { content?, status?, title? }；支持锁定/解锁。 |
| 重写单章       | POST   | /api/projects/:id/chapters/:chapterIndex/rewrite | 重新生成本章正文（可带相同 wordCount）。 |
| 批量获取前文摘要 | GET    | /api/projects/:id/chapters/summaries | query: upToChapterIndex；用于生成下一章时的上下文。 |

### 3.6 一致性检查

| 说明           | Method | Path | 说明 |
|----------------|--------|------|------|
| **发起检查（已实现）** | POST | **/api/projects/:id/consistency/run** | 同步：调 AI 分析项目正文摘要+设定+大纲+角色，写回 project.consistencyReport；返回 ConsistencyReport。 |
| **获取检查状态（已实现）** | GET | **/api/projects/:id/consistency/status** | 返回 { status, checkedAt }。 |
| **获取检查报告（已实现）** | GET | **/api/projects/:id/consistency/report** | 返回 ConsistencyReport（含 issues）。 |
| 发起检查（异步） | POST   | /api/projects/:id/consistency/run | 异步任务时返回 reportId 或轮询 URL。 |

### 3.7 导出

| 说明           | Method | Path | 说明 |
|----------------|--------|------|------|
| **导出文件（已实现）** | GET | **/api/projects/:id/export** | format=txt；scope=all（全部有正文）或 locked（仅已锁定）；chapters=1,2,3 可指定要导出的章节（scope=locked 时）。返回 TXT 附件。 |
| 导出 Word       | GET    | /api/projects/:id/export | format=docx（后续实现）。 |

### 3.8 1000 章上限与一致性检查范围（v1.2）

- **章节数上限**：全书支持 1～1000 章；大纲生成接口 `totalChapters`、分批接口 `startChapterIndex`/`endChapterIndex` 均受此范围约束。
- **大纲分批生成（已实现）**：`POST /api/ai/outline/generate-batch`，body 含 `startChapterIndex`、`endChapterIndex`、`previousChapters`（已生成章节摘要，用于衔接）。前端章数 > 12 时走分批，每批 10 章；章数 > 100 时前端应二次确认或提示预计耗时较长。
- **一致性检查范围**：因模型上下文限制，当全书章数 > 150 时，后端仅取**最近 150 章**参与检查。响应 ConsistencyReport 中可选包含 `checkedChaptersRange: { from, to, total }`，前端应展示「本次检查第 X–Y 章（全书共 Z 章）」。
- **项目体积与导出**：单项目 JSON 可能达约 5–10MB（1000 章 × 约 3000 字/章）；导出 TXT 为内存拼接，当前实现可接受，更大体量可考虑流式导出。

---

## 四、关键接口请求/响应示例

### 4.1 创建项目

**请求**  
`POST /api/projects`

```json
{
  "worldBackground": "古代",
  "genre": "玄幻",
  "coreIdea": "废柴逆袭，宗门争霸"
}
```

**响应**  
`201 Created`

```json
{
  "id": "proj-uuid-001",
  "userId": "user-001",
  "status": "draft",
  "title": null,
  "oneLinePromise": null,
  "setting": {
    "worldBackground": "古代",
    "genre": "玄幻",
    "coreIdea": "废柴逆袭，宗门争霸"
  },
  "createdAt": "2025-02-14T10:00:00Z",
  "updatedAt": "2025-02-14T10:00:00Z"
}
```

### 4.2 生成候选书名

**请求**  
`POST /api/projects/proj-uuid-001/titles/suggest`

```json
{}
```

**响应**  
`200 OK`

```json
{
  "candidates": [
    "宗门弃徒的逆袭之路",
    "废柴少年与宗门争霸",
    "从杂役到宗门之主"
  ]
}
```

### 4.3 确定书名（含可选一句话承诺）

**请求**  
`POST /api/projects/proj-uuid-001/title/confirm`

```json
{
  "title": "宗门弃徒的逆袭之路",
  "oneLinePromise": "被逐出宗门的少年，在绝境中觉醒血脉，重返宗门夺回一切。"
}
```

**响应**  
`200 OK`

```json
{
  "status": "title_set",
  "title": "宗门弃徒的逆袭之路",
  "oneLinePromise": "被逐出宗门的少年，在绝境中觉醒血脉，重返宗门夺回一切。"
}
```

### 4.4 生成大纲

**请求**  
`POST /api/projects/proj-uuid-001/outline/generate`

```json
{
  "totalChapters": 30
}
```

**响应**  
`200 OK`

```json
{
  "totalChapters": 30,
  "chapters": [
    {
      "chapterIndex": 1,
      "title": "逐出宗门",
      "goal": "交代主角被逐的起因与当下处境",
      "points": [
        "林羽因血脉被废遭逐",
        "与师妹苏晴的告别",
        "下山途中遇险伏笔"
      ]
    }
  ],
  "volumes": []
}
```

### 4.5 生成单章正文

**请求**  
`POST /api/projects/proj-uuid-001/chapters/1/generate`

```json
{
  "wordCount": 3000
}
```

**响应**  
`200 OK`

```json
{
  "id": "ch-uuid-001",
  "projectId": "proj-uuid-001",
  "chapterIndex": 1,
  "status": "draft",
  "title": "逐出宗门",
  "goal": "交代主角被逐的起因与当下处境",
  "points": ["林羽因血脉被废遭逐", "与师妹苏晴的告别", "下山途中遇险伏笔"],
  "content": "……（正文内容）……",
  "wordCount": 3000,
  "summary": "林羽被逐出宗门，与苏晴告别后下山。",
  "createdAt": "2025-02-14T11:00:00Z",
  "updatedAt": "2025-02-14T11:00:00Z"
}
```

### 4.6 锁定章节

**请求**  
`PATCH /api/projects/proj-uuid-001/chapters/1`

```json
{
  "status": "locked"
}
```

**响应**  
`200 OK`

```json
{
  "chapterIndex": 1,
  "status": "locked"
}
```

### 4.7 一致性检查报告

**请求**  
`GET /api/projects/proj-uuid-001/consistency/report`

**响应**  
`200 OK`

```json
{
  "projectId": "proj-uuid-001",
  "checkedAt": "2025-02-14T12:00:00Z",
  "status": "completed",
  "issues": [
    {
      "type": "timeline",
      "severity": "warning",
      "chapterIndex": 5,
      "message": "第五章提到「三日后」与第三章时间线冲突",
      "suggestion": "建议将「三日后」改为「五日后」或统一前文时间"
    },
    {
      "type": "character",
      "severity": "error",
      "chapterIndex": 8,
      "message": "苏晴说话风格与设定中的「寡言冷清」不符"
    }
  ]
}
```

### 4.8 导出（JSON 示例）

**请求**  
`GET /api/projects/proj-uuid-001/export?format=json`

**响应**  
`200 OK`，Content-Type: application/json

```json
{
  "project": {
    "id": "proj-uuid-001",
    "title": "宗门弃徒的逆袭之路",
    "oneLinePromise": "…",
    "setting": { "worldBackground": "古代", "genre": "玄幻", "coreIdea": "…" }
  },
  "outline": { "totalChapters": 30, "chapters": [ … ] },
  "characters": [ … ],
  "chapters": [
    { "chapterIndex": 1, "title": "逐出宗门", "content": "…", "wordCount": 3000 }
  ]
}
```

---

## 五、与产品文档的对应关系（v1.1 顺序）

| 产品阶段       | 主要状态         | 主要接口 |
|----------------|------------------|----------|
| 阶段 0 设定    | draft            | POST/GET/PATCH projects, PATCH setting |
| 阶段 1 书名   | title_set        | POST titles/suggest, POST title/confirm |
| 阶段 2 角色   | characters_ok    | GET/PUT characters, POST characters/confirm；可选 POST characters/suggest |
| 阶段 3 大纲   | outline_ok       | POST outline/generate（可带 characters），PUT outline, POST outline/confirm |
| 阶段 4 按章写 | writing          | POST chapters/:n/generate, PATCH chapters/:n, POST chapters/:n/rewrite |
| 阶段 5 一致性 | checking         | POST consistency/run, GET consistency/status, GET consistency/report |
| 阶段 6 导出   | completed        | GET export |

---

## 六、后续 App 互通注意点

- **用户与项目**：同一 `userId` 下，Web 与 App 共用 `/api/projects`，项目 ID 全局唯一。
- **章节与摘要**：`Chapter.summary` 可由后端在生成或保存时维护，App 拉取章节列表时即可用于「前文摘要」或离线展示。
- **导出 JSON**：便于 App 解析并做本地缓存或离线阅读；后续可增加「增量同步」接口（如按 `updatedAt` 拉取变更章节）。
- **鉴权**：建议统一使用同一套 Token 或 OAuth，便于 Web/App 共用接口。

---

---

## 七、流程变更说明与建议落实（v1.0 → v1.1）

- **状态机**：`title_set` 之后改为先进入 `characters_ok`（确认角色），再进入 `outline_ok`（确认大纲）；接口清单中角色相关接口（3.3）置于大纲（3.4）之前。
- **大纲生成（已落实）**：`POST /api/ai/outline/generate` 已接收 `characters`，前端调用时传入已确认角色列表；DeepSeek 提示词中已加入「已确认角色」列表并强调「根据下列角色设计章节与冲突」，保证大纲与角色一致。
- **AI 推荐角色（已落实）**：已实现 `POST /api/ai/characters/suggest`，根据书名+设定生成 3～8 个候选角色；前端角色页提供「AI 推荐角色」按钮，用户可选用、编辑后确认。
- **文档与规则**：流程变更须同步更新《产品文档》与本文档；**建议落实**时须在文档中补充已落实内容（见项目规则「建议落实同步文档」）。

**文档结束**。开发时以本文档与《产品文档-AI小说生成流程.md》为准，如有变更请同步更新两处。
