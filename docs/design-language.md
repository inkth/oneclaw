# 发现猫 · Design Language（设计语言）

> 版本：v1 · 2026-07-09
> 定位：重建整套设计语言，而非在现有页面上微调。目标是**国际一线 AI SaaS 的视觉水准**。
> 参照系：**Linear（秩序）× Apple（克制）× Stripe（高级）× Vercel（干净）× Perplexity/Arc（AI 气质）**。

---

## 0. 四个关键词

整个产品只服务四个词，任何设计取舍都回到这里：

| 关键词 | 含义 | 反面（我们不做的） |
| --- | --- | --- |
| **Quiet 安静** | 视觉噪音最小，页面会呼吸 | 炫酷、发光、满屏动效 |
| **Premium 高级** | 靠排版、留白、节奏，而非装饰 | 渐变、毛玻璃、厚阴影 |
| **AI Native AI 原生** | 极简、可信、静，主角是对话与产出 | 科技蓝紫、赛博风 |
| **Data First 数据优先** | 数据即情报，等宽数字、清晰层级 | 花哨图表、彩色堆叠 |

**总约束（贯穿全文）：**
> 任何一个页面，**删掉 30% 的视觉元素后应该看起来更高级**。
> 这是 Linear / Notion / Vercel / Raycast 长期保持高级感的核心。凡不能通过这条测试的设计都要减。

---

## 1. 减法：去掉 70% 的边框与容器

现状问题：几乎每个区块都是一张 Card（边框 + 阴影 + 背景），页面被切成一格格。世界级 SaaS 不这样做。

**原则**
- 默认**不加容器**。区块之间用 **留白 + 排版层级** 分隔，而不是边框。
- 只有真正需要「可点击对象」「可悬浮对象」时才用 Card。
- 页面允许**至多三层**视觉层级：`背景 → 内容 → Hover`。不允许 Card 里套 Card、再叠 Shadow + Border + Badge。

```
现在（每块都是 Card）        目标（几乎无边框，靠留白）
┌──────────┐                 Hero
│  Hero    │                 Input
└──────────┘                 Quick Action
┌──────────┐                 Videos
│  Input   │
└──────────┘                 —— 分隔只靠 whitespace
┌──┐┌──┐┌──┐
│C ││C ││C │
└──┘└──┘└──┘
```

---

## 2. 留白：留白比内容重要

敢「浪费」空间，是高级感的来源（Apple 逻辑）。全站遵循 **8pt Grid**，纵向节奏放大：

| 位置 | 纵向间距（上下） |
| --- | --- |
| Hero 区 | **120px** |
| Input 区 | **80px** |
| Section 区 | **100px** |
| 页面左右边距（桌面） | **80px** |

不要 24px 挤在一起。呼吸感优先。

---

## 3. Typography：让排版当主角

层级靠**字号 / 字重**，不靠颜色和背景。

| 角色 | 字号 | 字重 | 备注 |
| --- | --- | --- | --- |
| Hero 标题 | 64px | 700 | 页面唯一的大字 |
| Subtitle | 20px | 400 | 副标题，弱 |
| Section 标题 | 28px | 600 | |
| Card 标题 | 18px | 600 | |
| Body 正文 | 15px | 400 | |

- **数据一律用等宽数字**（`font-variant-numeric: tabular-nums`）：榜单 ±%、金额、排名对齐。
- 「字体就是设计」——去掉靠背景撑场面的思路。

---

## 4. 颜色：95% 黑白灰 + 5% 品牌紫

全站**只有一种强调色**。禁止紫+蓝+绿+橙同时出现当装饰。

```
Primary（品牌紫）  #6E56FF
背景               #FAFAFB
主文字             #111111
次文字 Secondary   #666666
Border             #ECECEC
```

- 彩色**只做语义点缀**（涨/跌、成功/失败/警告），不做氛围装饰。
- 与现有代码衔接：`lib/ui/tokens.ts` 已是「全站唯一色板真源」。本方向要求把 `STATUS_TONES` 里的彩色继续**收敛为语义专用**，Agent 身份等场景逐步统一到「灰底 + 品牌紫点缀」，减少多色并置。
- 现有电紫品牌色（brand-*）与 `#6E56FF` 同族，作为唯一强调色保留。

---

## 5. 阴影：极弱或无

- 删掉传统 `0 4px 20px rgba(...)` 之类的厚投影。
- 需要时只用 `0 1px 2px`；能不用就不用。
- 结构靠 **Layer（层）与留白** 表达，而非阴影（Linear 基本无 Shadow）。

---

## 6. 圆角：三档，不滥用大圆角

| 元素 | 圆角 |
| --- | --- |
| 按钮 | **12** |
| Input | **16** |
| Card | **20** |
| Modal | **24** |

不要全站一个大圆角（20/24/32 到处用）。高级产品在圆角上很克制。

---

## 7. 按钮

- 高度 **44px**，左右 padding **20**，字号 **15**，字重 **600**。
- **无描边、无渐变。**
- Hover：背景加深 **+4%**。
- Active（点击）：`scale(0.98)`。
- 就够了，不做更多。

---

## 8. Icon：Lucide Outline，全站统一

- 统一 **Lucide**，全部 **Outline**（不用 Filled，不用 emoji）。
- **Stroke = 1.75**。
- 统一后全站气质立刻一致。（与现有「no-emoji-icons」约定一致。）

---

## 9. Grid：严格 8pt

所有间距只允许取自这套阶梯：

```
8  16  24  32  40  48  64  80
```

禁止 27 / 35 / 41 这种「随手值」。12 栅格用于横向布局。

---

## 10. 层级：只允许三层

```
背景
  ↓
内容
  ↓
Hover
```

不允许「背景 + Card + Card 里 Card + Shadow + Border + Badge + Icon」层层叠加。

---

## 11. Hero

- **不需要背景**：纯白。
- 结构极简：`一句话 → 输入框 → 结束`。
- Hero 的真正主角是**输入框**，不是插画、不是渐变。

---

## 12. Input（参照 Perplexity）

- 高度 **72px**。
- 边框 **1px**；Focus 时边框转品牌紫。
- 左侧一个 Icon，右侧一个 Send。
- **没有其它元素**（不做成聊天气泡框那种堆料）。

---

## 13. Card

```
背景     #FFFFFF
Border   #ECECEC
Shadow   None
```

- Hover：`translateY(-2px)` + Border 转 Primary。
- 仅此而已。

---

## 14. 动画：微交互，几乎无炫技

顶级产品动效占「体感高级度」的一半，但都是克制的微交互，**全部 Ease Out**：

| 场景 | 时长 / 曲线 |
| --- | --- |
| Hover | 120ms |
| Button | 150ms |
| Sidebar | 220ms |
| Modal | Spring |
| Tab 切换 | Shared Layout（共享布局过渡） |

范围 **120–200ms** 为主。不做长动画、不做炫技动画。

---

## 15. AI 气质：静

- 参照 **Cursor / Claude / Perplexity**：几乎全白，品牌色只点缀。
- 不做「蓝紫科技 + 发光」。AI 的高级感来自**极简、安静、可信**。

---

## 16. Logo

- **缩小**。现在 Logo 太抢戏。
- 页面真正的主角是输入框 / 内容，不是品牌标。（沿用「发现猫」中文字标 + 单线猫 logo。）

---

## 17. 导航（左侧栏）

- 宽 **64px**（不是 80）。
- Icon **20px**。
- Hover：灰。
- Active：**一条紫色竖条**，不是整块紫背景。

---

## 18. 图片 / 视频

- 圆角统一 **12**（不用 20）。
- 比例 **9:16**。
- Hover：轻微放大即可。

---

## 19. 高级感的真正来源

不是毛玻璃、不是渐变、不是发光，而是这六件事：

```
Typography（排版）
Whitespace（留白）
Rhythm（节奏）
Motion（动效）
Grid（栅格）
Consistency（一致性）
```

---

## 20. 汇总：Design System 速查

| 模块 | 设计方向 |
| --- | --- |
| 风格 | Apple 克制 + Linear 秩序 + Stripe 高级 + Perplexity AI 感 |
| 配色 | 95% 黑白灰 + 5% 品牌紫，仅一种强调色（`#6E56FF`） |
| 布局 | 超大留白、12 栅格、8pt Grid，减少容器与边框 |
| 字体 | Typography 驱动层级，大标题 / 小说明，数据用等宽数字 |
| 圆角 | 12 / 16 / 20（Modal 24），不滥用大圆角 |
| 图标 | Lucide Outline，Stroke 1.75，全站统一 |
| 动效 | 微交互为主 120–200ms，Spring 过渡，几乎无炫技 |
| 阴影 | 极弱或无，靠留白与层级表达结构 |
| AI 气质 | 极简、安静、可信，而非「科技蓝 + 发光」 |

**验收测试（每个页面都要过）：删掉 30% 的视觉元素后，是否反而更高级？** 若否，继续减。

---

## 21. Design Tokens 草案（落地锚点）

后续落到 `lib/ui/tokens.ts` / Tailwind 主题时的目标值，先在此对齐：

```ts
// 颜色
color: {
  primary:   "#6E56FF",  // 唯一强调色
  bg:        "#FAFAFB",
  text:      "#111111",
  secondary: "#666666",
  border:    "#ECECEC",
  cardBg:    "#FFFFFF",
}

// 间距（8pt Grid，只取这些值）
space: [8, 16, 24, 32, 40, 48, 64, 80]
sectionGap: { hero: 120, input: 80, section: 100, pageX: 80 }

// 圆角
radius: { button: 12, input: 16, card: 20, modal: 24, media: 12 }

// 字体
type: {
  hero:     { size: 64, weight: 700 },
  subtitle: { size: 20, weight: 400 },
  section:  { size: 28, weight: 600 },
  cardTitle:{ size: 18, weight: 600 },
  body:     { size: 15, weight: 400 },
  data:     "tabular-nums",
}

// 动效（全部 ease-out）
motion: { hover: 120, button: 150, sidebar: 220, modal: "spring", range: "120–200ms" }

// 组件
button: { height: 44, padX: 20, size: 15, weight: 600, hover: "+4% bg", active: "scale(0.98)" }
input:  { height: 72, border: 1, focus: "primary border", left: "icon", right: "send" }
nav:    { width: 64, icon: 20, active: "purple bar" }
icon:   { lib: "lucide", style: "outline", stroke: 1.75 }
shadow: { default: "none | 0 1px 2px" }
```
