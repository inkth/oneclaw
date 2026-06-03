import type { Plan } from "@prisma/client";

export const PERIODS = [1, 3, 12] as const;
export type Period = (typeof PERIODS)[number];

// 月单价（人民币 分）
const MONTHLY_PRICE_CENTS: Record<Plan, number> = {
  FREE: 0,
  PRO: 19900, // ¥199 / 月
  TEAM: 89900, // ¥899 / 月
};

// 周期折扣：12 个月 7.5 折，3 个月 9 折
const PERIOD_MULTIPLIER: Record<Period, number> = {
  1: 1,
  3: 2.7, // 3 × 0.9
  12: 9, // 12 × 0.75
};

export function priceFor(plan: Plan, months: Period): number {
  return Math.round(MONTHLY_PRICE_CENTS[plan] * PERIOD_MULTIPLIER[months]);
}

export function isPayablePlan(p: Plan): p is "PRO" | "TEAM" {
  return p === "PRO" || p === "TEAM";
}

export function formatCny(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/**
 * 把订阅周期换算为「到期时间」。若工作台当前还有未到期的余额，按延期处理。
 */
export function computePlanExpiresAt(
  currentExpiresAt: Date | null,
  months: Period,
): Date {
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > Date.now()
      ? currentExpiresAt
      : new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}
