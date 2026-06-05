// 全站唯一的色板真源。各页面/组件不要再内联 toneMap / tonePalette / 渐变字符串，
// 一律从这里取。明亮精致：中性 zinc 基底 + 单一主色电紫 brand，彩色仅作语义化点缀。

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

/** 三 Agent 身份：仅作小 chip 标识 + 极小图标块，不再大面积渐变。 */
export const AGENT_IDENTITY = {
  ANALYST: { label: "分析师", tone: "brand" as Tone, dot: "bg-brand-500" },
  DIRECTOR: { label: "创意总监", tone: "violet" as Tone, dot: "bg-violet-500" },
  OPERATOR: { label: "运营官", tone: "fuchsia" as Tone, dot: "bg-fuchsia-500" },
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
