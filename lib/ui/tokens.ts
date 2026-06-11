// 全站唯一的色板真源。各页面/组件不要再内联 toneMap / tonePalette / 渐变字符串，
// 一律从这里取。明亮精致：中性 zinc 基底 + 单一主色电紫 brand，彩色仅作语义化点缀。

import {
  BarChart3,
  Clapperboard,
  LayoutList,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/** 全站统一聚焦环：非原语调用点直接引用，避免硬编码 ring 颜色。 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";

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
 *  图标统一用 lucide 线性图标(不用 emoji),与全站 Stripe/Linear 风格一致。 */
export const AGENT_IDENTITY = {
  ANALYST: { label: "选品分析", icon: TrendingUp as LucideIcon, tone: "brand" as Tone, dot: "bg-brand-500" },
  DIRECTOR: { label: "短视频创作", icon: Clapperboard as LucideIcon, tone: "violet" as Tone, dot: "bg-violet-500" },
  LISTING: { label: "Listing 内容", icon: LayoutList as LucideIcon, tone: "info" as Tone, dot: "bg-sky-500" },
  REVIEW: { label: "投放复盘", icon: BarChart3 as LucideIcon, tone: "success" as Tone, dot: "bg-emerald-500" },
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
