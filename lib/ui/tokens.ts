// 全站唯一的色板真源。各页面/组件不要再内联 toneMap / tonePalette / 渐变字符串，
// 一律从这里取。明亮精致：中性 zinc 基底 + 单一主色电紫 brand，彩色仅作语义化点缀。

import {
  BarChart3,
  Clapperboard,
  Compass,
  LayoutList,
  ScanText,
  Shirt,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/** 全站统一聚焦环：电紫点睛（violet 不受 app-skin 近黑级联，故工作台内焦点环亦电紫）。 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40";

/** 语义状态色：用于 Badge / Pill / 状态徽章。 */
export const STATUS_TONES = {
  brand: "bg-brand-50 text-brand-700 border-brand-100",
  neutral: "bg-zinc-100 text-zinc-600 border-zinc-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-100",
  warning: "bg-amber-50 text-amber-700 border-amber-100",
  danger: "bg-rose-50 text-rose-700 border-rose-100",
  info: "bg-sky-50 text-sky-700 border-sky-100",
  violet: "bg-violet-50 text-violet-700 border-violet-100",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
} as const;

export type Tone = keyof typeof STATUS_TONES;

/** Agent 身份：链路导向的产出物胶囊 + 任务列表小 chip 标识，不大面积渐变。
 *  图标统一用 lucide 线性图标（不用 emoji），与全站 Stripe/Linear 风格一致。
 *
 *  tile = Agent「入口图标块」的彩色渐变底（照搬 Designkit 的 app-icon 观感）。
 *  这是 Design Language §4 唯一的多色例外：色相在此**承载 Agent 身份**，不是装饰。
 *  注意色值必须写显式色相（violet/sky/…）而非 brand-*——`.app-skin` 会把 --brand-* 级联
 *  改写为近黑，用 brand-* 的话工作台内这块图标会整块变黑。 */
export const AGENT_IDENTITY = {
  ADVISOR: { label: "跨境顾问", icon: Compass as LucideIcon, tone: "warning" as Tone, dot: "bg-amber-500", tile: "from-amber-400 to-orange-500" },
  ANALYST: { label: "选品分析", icon: TrendingUp as LucideIcon, tone: "brand" as Tone, dot: "bg-brand-500", tile: "from-violet-500 to-indigo-600" },
  DIRECTOR: { label: "短视频创作", icon: Clapperboard as LucideIcon, tone: "violet" as Tone, dot: "bg-violet-500", tile: "from-fuchsia-500 to-pink-500" },
  LISTING: { label: "Listing 内容", icon: LayoutList as LucideIcon, tone: "info" as Tone, dot: "bg-sky-500", tile: "from-sky-400 to-blue-500" },
  REVIEW: { label: "投放复盘", icon: BarChart3 as LucideIcon, tone: "success" as Tone, dot: "bg-emerald-500", tile: "from-emerald-400 to-teal-500" },
  TRYON: { label: "虚拟试穿", icon: Shirt as LucideIcon, tone: "info" as Tone, dot: "bg-sky-500", tile: "from-cyan-400 to-sky-500" },
  VIDEO_ANALYSIS: { label: "视频解析", icon: ScanText as LucideIcon, tone: "fuchsia" as Tone, dot: "bg-fuchsia-500", tile: "from-rose-400 to-red-500" },
} as const;

export type AgentKey = keyof typeof AGENT_IDENTITY;

/** AgentTask 执行状态 → 语义 tone。 */
export const TASK_STATUS_TONE: Record<string, Tone> = {
  QUEUED: "neutral",
  RUNNING: "warning",
  DONE: "success",
  FAILED: "danger",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  QUEUED: "排队中",
  RUNNING: "执行中",
  DONE: "已完成",
  FAILED: "失败",
};

/** 涨跌语义色：榜单 ±%、趋势 chip、sparkline。各页不再内联 text-emerald/text-rose。 */
export type DeltaDir = "up" | "down" | "flat";

export const DELTA_TONES: Record<DeltaDir, string> = {
  up: "text-emerald-600",
  down: "text-rose-600",
  flat: "text-zinc-400",
};

/** sparkline 描边/填充用的原始色值（SVG stroke/fill 需具体色，不能用 class）。 */
export const DELTA_STROKE: Record<DeltaDir, string> = {
  up: "#059669",
  down: "#e11d48",
  flat: "#a1a1aa",
};

export function deltaDir(value: number | null | undefined): DeltaDir {
  if (value == null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/** 榜单奖牌：仅 Top3 金/银/铜实体徽章，>3 由调用方回退灰数字。 */
export const RANK_MEDAL: Record<1 | 2 | 3, string> = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_2px_8px_-2px_rgba(245,158,11,0.5)]",
  2: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-[0_2px_8px_-2px_rgba(100,116,139,0.4)]",
  3: "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950 shadow-[0_2px_8px_-2px_rgba(234,88,12,0.45)]",
};

/** 选品 AI 判定 → 语义 tone + 中文标签。消灭 discover-client 内联三元色串。 */
export const VERDICT_TONE: Record<string, Tone> = {
  RECOMMENDED: "success",
  AVOID: "danger",
};

export const VERDICT_LABEL: Record<string, string> = {
  RECOMMENDED: "推荐",
  AVOID: "避开",
};
