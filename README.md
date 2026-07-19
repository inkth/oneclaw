# 发现猫

> 给跨境电商新手的 TikTok Shop 全链路 AI 工具 —— 选品、做视频、复盘,一句话开干。

发现猫 把「找爆品 → 出带货短视频 → 复盘投放」三件事收进一个工作台,由一排 AI Agent 完成。

## 产品 = 三件事 + 5 个 Agent

工作台(`/app`)是统一派活台,一排胶囊切换 Agent,写一句指令就能开干:

| Agent | 做什么 | 数据 / 模型 |
| --- | --- | --- |
| **选品分析 ANALYST** | 拉 EchoTik 四榜(商品 / 店铺 / 达人 / 视频)+ LLM 可行性评分,可关键词搜索、按类目筛选、收藏入库 | EchoTik · OpenRouter |
| **短视频 DIRECTOR** | 一句话出**单条**带货短视频:AI 自选叙事角度写脚本 → 异步出片 → 烧口播字幕 + 价格 CTA 尾帧。会逆向真实带货爆款、按目标市场出母语口播、读本店复盘成绩反哺脚本 | OpenRouter(脚本 / 视频)· fal(封面)· ffmpeg |
| **Listing 内容 LISTING** | 标题 / 五点卖点 / A+ 图文 / 主图出图 prompt | OpenRouter · fal |
| **虚拟试穿 TRYON** | 选模特图 + 服饰图,生成上身图 | fal |
| **投放复盘 REVIEW** | 上传 GMVMax 投流报表(CSV / XLSX)→ ROI 四象限诊断 + 止损 / 加投建议 | 报表解析 · OpenRouter |

选品库可一键「为它做视频 / 做 Listing」接力到工作台(带 `productId` 注入真实商品数据)。

> 已**主动下线**:品牌运营官 / 排期发布(无真实发布能力)、全链路小队一键串行 —— 不是窟窿,别去「补齐」。

## 技术栈

**前端纯展示,所有后端逻辑在 Go。**

- **前端**:Next.js 16(App Router)+ React 19 + Tailwind v4 + TypeScript。只渲染 + 调 Go API,无后端逻辑、无 Prisma。
- **后端**:Go 1.25 + Gin + GORM,代码在 [`server/`](server/)。启动自动 `AutoMigrate`。
- **数据库**:Postgres(Go 自建 schema,uuid 主键)。
- **鉴权**:Go 侧 JWT cookie(`oc_session`)+ 手机验证码,**非** Auth.js。
- **外部集成**:EchoTik(选品数据)· OpenRouter(LLM + 视频)· fal(图 / 封面 / 试穿)· 腾讯云 COS(对象存储)· SMS(验证码)。
- **计费**:积分制 —— 扣费 / 额度(按订阅周期重置)/ 下单 / 订单 / 旗舰版（内部标识 `TEAM`）超额结算均已落库生效。

前端经 [`lib/api-client.ts`](lib/api-client.ts) 调后端:`GO_API_INTERNAL_URL`(默认 `http://localhost:8082`)拼 `/api/v1`。**路由全集以 [`server/internal/router/router.go`](server/internal/router/router.go) 为准**(不在此枚举,免得过时)。

## 本地开发

需要一个 Postgres。前后端分别起:

```bash
# 前端
npm install
npm run dev            # http://localhost:3000

# 后端(另开终端)
cd server
go run ./cmd           # 默认 :8082,启动自动建表
```

后端环境变量读 [`server/internal/config/config.go`](server/internal/config/config.go);常用项见 [`server/.env.example`](server/.env.example)(`cp server/.env.example .env` 后填值),主要几族:

- `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` —— Postgres
- `JWT_SECRET` —— 会话签名
- `ECHOTIK_BASE_URL` / `ECHOTIK_USERNAME` / `ECHOTIK_PASSWORD` —— 选品数据(缺则发现页走 mock)
- `OPENROUTER_API_KEY`(+ `OPENROUTER_MODEL` / `OPENROUTER_ADVISOR_MODEL` / `OPENROUTER_TRANSLATE_MODEL` / `OPENROUTER_REVIEW_MODEL`)—— 文本、顾问、翻译和复盘默认统一使用 MiniMax M3；音频、出图和视频仍配置各自专用模型
- `SMS_PROVIDER` —— 手机验证码
- COS 桶配置 —— 对象存储(榜单封面永久化依赖)

> **只想预览前端、本地没 Postgres**:在 `.env.local` 里设 `GO_API_INTERNAL_URL=https://faxianmao.com` 指向测试后端,即可用真实数据跑游客页;验证完删掉。

预置出镜人设(虚拟试穿 / 出镜)补种:

```bash
docker compose run --rm go-api ./server --seed-personas
```

## 部署

生产 = Go 全栈 docker(compose)。根目录:

```bash
./deploy.sh            # build → 推镜像 → 远端起服务;compose 文件 docker-compose.prod.yml
```

→ faxianmao.com(腾讯云)。具体流程见 [`deploy.sh`](deploy.sh)。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| [`app/`](app/) | Next.js 前端:`(app)/app` 工作台、`pricing` 定价、`(auth)` 登录、`intro` 营销 |
| [`components/`](components/) · [`lib/`](lib/) | 共享 UI 原语 + 前端工具(`api-client.ts`、`credits.ts` 等) |
| [`server/internal/handler/`](server/internal/handler) | HTTP handlers |
| [`server/internal/service/`](server/internal/service) | 业务逻辑(`agent_*.go` 五个 Agent、`discover*`、`billing`、`quota`、`video*`) |
| [`server/internal/model/`](server/internal/model) | GORM 模型 |
| [`docs/go-migration-plan.md`](docs/go-migration-plan.md) | Next/Prisma → Go 迁移记录(架构权威) |

## 现状(诚实)

- ✅ 三件事(选品 / 做视频 / 复盘)+ Listing / 试穿端到端可用;选品→做视频接力、复盘成绩→脚本反哺已打通。
- 🚧 **真实收款渠道**(微信 / 支付宝商户)未接 —— 计费账本 / 额度 / 下单全真,生产暂诚实拒单并引导联系客服。
- 🚧 **店铺真实绑定**(OAuth + 自动拉投放数据)开发中 —— 复盘当前靠手动上传报表。
- 🚧 **视频↔复盘按条精确归因**(GMVMax Creative ID ↔ Video ID)待做。
