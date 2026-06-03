# OneClaw

> 你的 AI 出海团队 — 从洞察到变现，一站搞定。

Next.js 16 App Router + Tailwind v4 + Prisma 6 + Auth.js v5 + Postgres + OpenRouter + fal.ai。

## 功能

- 🏠 **营销落地页**：Hero、痛点、工作流对比、选品（精简）、内容创作、Agent 团队、合作伙伴、CTA、Footer
- 🔐 **认证**：邮箱+密码（bcrypt），Auth.js v5 凭证登录，JWT session，proxy 保护 `/app`
- 🗄️ **数据层**：Prisma 6 / Postgres，`User` `Workspace` `Membership` `Product` `Video` `AgentTask` `NewsletterSubscription` `DemoRequest`
- 🤖 **AI Agent**（已真实化，三种角色）：
  - **Market Analyst** —— OpenRouter (Claude/GPT/Gemini 可切) 输出结构化 JSON，自动写入 `Product` 表
  - **Creative Director** —— LLM 写 4 套脚本 + fal `flux/schnell` 并行生成 4 张封面 + fal `kling-video` 提交 4 个 5s 视频生成任务
  - **Brand Operator** —— 基于工作台已有视频生成本周三平台发布日历
- ⏳ **异步执行**：`POST /agent-tasks` 立即返回 `QUEUED` 任务，`after()` 后台执行，前端每 2.5s 轮询任务状态，视频生成每 8s 轮询 fal 队列
- 📡 **API**：见下表
- 🧑‍💻 **/app 工作台**：概览（任务/选品/视频统计）、选品库、短视频墙（含 fal 视频内联播放）、Agent Runner、设置

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 准备环境变量
cp .env.example .env.local
# 编辑 .env.local 填上 DATABASE_URL / AUTH_SECRET / OPENROUTER_API_KEY / FAL_KEY

# 3. 推到数据库 + 跑 seed
npm run db:push      # 或 db:migrate
npm run db:seed      # 创建 demo@oneclaw.ai / demopass1234，含 4 选品 4 视频

# 4. 启动
npm run dev
```

打开 http://localhost:3000

| 路径 | 说明 |
| --- | --- |
| `/` | 落地页 |
| `/register` | 注册（自动建工作台 + 自动登录） |
| `/login` | 登录 |
| `/app` | 工作台首页（未登录会跳 `/login`） |
| `/app/products` | 选品库（Analyst 写入） |
| `/app/videos` | 短视频墙（Director 写入，含 fal 视频/封面） |
| `/app/agents` | Agent 派发器（含历史） |
| `/app/settings` | 账号/工作台 |
| `npm run db:studio` | Prisma Studio |

## API

| 路径 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/api/auth/[...nextauth]` | * | - | Auth.js handlers |
| `/api/auth/register` | POST | 公开 | 注册（事务建 user + workspace + membership） |
| `/api/subscribe` | POST | 公开 | 落地页邮件订阅 |
| `/api/demo` | POST | 公开 | 预约演示 |
| `/api/me` | GET | 登录 | 当前用户 + 默认工作台 |
| `/api/workspaces/:id/products` | GET / POST | Membership | 选品 |
| `/api/workspaces/:id/videos` | GET | Membership | 视频 |
| `/api/workspaces/:id/videos/:videoId/refresh` | POST | Membership | 拉一次 fal 队列状态，回写 `videoUrl` |
| `/api/workspaces/:id/agent-tasks` | GET / POST | Membership | 列出 / 派发 Agent 任务（异步） |
| `/api/workspaces/:id/agent-tasks/:taskId` | GET | Membership | 查单个任务，用于前端轮询 |

## Agent 实现

[`lib/agents/`](lib/agents/) 三个文件对应三位 Agent。它们都是 **真实** LLM/fal 调用：

```
lib/agents/llm.ts       —— OpenRouter chat 封装 + JSON 抽取（容忍 markdown 包裹）
lib/agents/analyst.ts   —— 系统 prompt 强制 JSON 输出 → zod 校验 → prisma.product.createMany
lib/agents/director.ts  —— 关联工作台 RECOMMENDED 商品 → LLM 4 脚本 → fal flux 4 封面（并行）+ fal kling 4 视频提交（并行）→ Video 行
lib/agents/operator.ts  —— 抓最近 12 个视频喂给 LLM → 三平台周日历 JSON
lib/agents/index.ts     —— executeAgentTask(): 更新状态 → dispatch → 写回 output / metadata / cost / tokens
```

派发链路：

```
client POST → route.ts 创建 QUEUED 任务 → after() 异步跑 executeAgentTask
client poll GET → 任务转 RUNNING → DONE/FAILED
DONE 时 router.refresh() 让选品/视频页同步
GENERATING 视频前端每 8s 轮询 fal 队列；完成后内联 <video> 播放
```

**模型 / 价格**：通过 env 切：
- `OPENROUTER_MODEL` 默认 `anthropic/claude-sonnet-4.5`（可换 haiku / opus / gpt-4o / gemini-2.5-pro）
- `FAL_IMAGE_MODEL` 默认 `fal-ai/flux/schnell`（最便宜，~$0.003 / 图）
- `FAL_VIDEO_MODEL` 默认 `fal-ai/kling-video/v1/standard/text-to-video`（~$0.05 / 5s 视频）

每个 AgentTask 落库时会记录 `model` / `tokensIn` / `tokensOut` / `costCents`，前端右上角显示 ¢ 数。

## 部署到 Vercel + 托管 Postgres

1. 用 Neon / Vercel Postgres / Supabase 建 Postgres
2. Vercel 项目环境变量：
   - `DATABASE_URL`
   - `AUTH_SECRET`（`openssl rand -base64 32`）
   - `AUTH_URL`（部署后的 https 域名）
   - `AUTH_TRUST_HOST=true`
   - `OPENROUTER_API_KEY`
   - `FAL_KEY`
   - 可选：`OPENROUTER_MODEL` / `FAL_IMAGE_MODEL` / `FAL_VIDEO_MODEL`
3. 首次部署：
   ```bash
   npx prisma migrate deploy
   npm run db:seed   # 可选
   ```
4. push 到 main，Vercel 自动 build（`postinstall` 会跑 `prisma generate`）

**Vercel maxDuration**：`/api/workspaces/[id]/agent-tasks` 设了 `export const maxDuration = 60`。Hobby 免费 10s，建议 Pro。如果跑视频生成 + 封面 + LLM 加起来超过 60s，请升级到 Pro 或拆成更细的后台任务（Inngest / Trigger.dev）。

## 关键文件速查

| 路径 | 作用 |
| --- | --- |
| `prisma/schema.prisma` | 数据模型，含 `VideoProcessing` 枚举与 `AgentTask.metadata` JSON 字段 |
| `prisma/seed.ts` | demo 用户 + 4 选品 + 4 视频 |
| `lib/db.ts` | Prisma client 单例 |
| `lib/workspace.ts` | 自动获取/创建默认工作台 |
| `lib/validations.ts` | 全部 zod schema |
| `lib/api.ts` | 统一 `ok` / `fail` / `handleError` |
| `lib/openrouter.ts` | OpenAI SDK 指向 OpenRouter，lazy 单例 |
| `lib/fal.ts` | fal.ai 客户端 + `generateCover` / `submitVideoJob` / `pollVideoStatus` |
| `lib/agents/*` | 三个 Agent 实现 + 调度器 |
| `auth.ts` / `auth.config.ts` / `proxy.ts` | Auth.js v5 + Next.js 16 proxy |
| `app/(auth)/` | login / register |
| `app/(app)/app/` | 工作台 |
| `app/api/` | 路由处理器 |

## 后续 TODO

- [ ] OAuth (Google / GitHub) + 邮箱验证 + 找回密码
- [ ] Rate limit（Upstash Ratelimit）+ Sentry
- [ ] Stripe 计费 + 用量配额（FREE/PRO/TEAM 关联 Plan）
- [ ] 多人协作邀请页（Membership 模型已建）
- [ ] 把 Agent 后台跑改成 Inngest / Trigger.dev 真异步队列 + SSE 流式输出
- [ ] 选品 / 视频的 CRUD UI（目前只读 + 自动生成）
- [ ] 定价页 + 落地页死链接（生态 / 网站搭建 / 客户管理）
- [ ] i18n
