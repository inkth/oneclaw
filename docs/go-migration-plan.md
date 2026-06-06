# 退役 Next/Prisma → Go 后端 迁移方案

**北极星**:Next = 纯前端,零后端逻辑。所有后端 = Golang(docker)。数据库 = Postgres(docker,Go 自建 schema,uuid 主键,独立于旧 Prisma 库)。

策略:**P0–P5 在 Go 里纯新增补齐后端能力(不动 Next);P6 再把 Next 切到 Go API 并删光 Prisma。**

## 缺口

Prisma 模型 23 个,Go 已实现 9 个(User / PhoneVerificationCode / Workspace / Membership / Product / DiscoverProduct / RanklistCacheEntry / DiscoverSnapshot / WorkspaceDiscoverInteraction)。

Go API 已覆盖:auth(send-code/login/logout)、me、workspaces/default、products CRUD、discover(ranklist/interactions/import/detail)。

待迁移的后端域(仍靠 Prisma):agent-tasks · discover/analyze · ai/copilot · materials · models(ModelAsset)· shops · templates(+optimize)· videos(+create/refresh)· billing(checkout/orders/webhooks)· quota · subscribe · demo · cron/echotik-refresh。

需在 Go 重写的外部集成:`openrouter`(LLM)· `fal`(图/视频)· `storage`(对象存储)· `lib/agents/*` 编排 + 异步执行。

## 阶段

| 阶段 | 内容 | 难度 | 状态 |
|---|---|---|---|
| P0 纯 CRUD | subscribe · demo · shops · models | 低 | ✅ 完成(subscribe/demo/shops/models) |
| P1 存储+素材 | storage→Go;materials | 中 | ⬜ |
| P2 AI 核心 | openrouter + agent-tasks 异步 + analyst/director/operator/copilot + discover/analyze + templates/optimize | 高 | ⬜ |
| P3 fal 媒体 | fal submit/poll + videos(create/refresh)+ director 图/视频 | 高 | ⬜ |
| P4 计费 | PaymentOrder + checkout + alipay/wechat webhooks | 高 | ⬜ |
| P5 定时 | cron/echotik-refresh → Go 定时任务 | 低 | ⬜ |
| P6 前端切换 + 清 Prisma | 剩余 SSR/客户端全切 Go API;删 app/api/*、prisma/、lib/db、lib/agents、lib/fal、lib/openrouter、@prisma/client 依赖、db:* 脚本、Auth.js 表;调整 docker/部署 | 中 | ⬜ |

## 待迁 / 顺序调整

- **quota** 原计划在 P0,但它聚合 videos / agent-tasks 等用量计数,而这些表要到 P2/P3 才有 → **推迟到 P3 之后**再做。
- shops 的 `_count.products` 形状改为 Go 侧的 `productCount` 字段(P6 前端适配)。

## 决策记录

- Auth.js 那 5 张表(Account/Session/VerificationToken/PasswordResetToken/EmailVerificationToken)作废 —— 鉴权全在 Go(oc_session JWT,手机验证码)。如需邮箱注册/找回密码,由 Go 另行实现。
- Go 库为全新 schema(uuid 主键),与旧 Prisma 库(cuid)物理隔离;不做数据迁移除非另行要求。
- 每个 Go 端点的 请求/响应 形状对齐原 Next 路由,便于 P6 前端 1:1 切换。
