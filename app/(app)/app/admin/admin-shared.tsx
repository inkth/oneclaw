"use client";

import type { Tone } from "@/lib/ui/tokens";

// 后台各 Tab 共用的格式化与映射。金额一律「分」,展示折算为元。

export function fmtYuan(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("zh-CN", { year: "2-digit", month: "numeric", day: "numeric" });
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PLAN_LABEL: Record<string, string> = { FREE: "免费版", PRO: "专业版", TEAM: "旗舰版" };
export const PLAN_TONE: Record<string, Tone> = { FREE: "neutral", PRO: "brand", TEAM: "success" };

export const ORDER_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "待支付", tone: "warning" },
  PAID: { label: "已支付", tone: "success" },
  EXPIRED: { label: "已过期", tone: "neutral" },
  CANCELLED: { label: "已取消", tone: "neutral" },
  REFUNDED: { label: "已退款", tone: "danger" },
};

export const OVERFLOW_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "待核销", tone: "warning" },
  PAID: { label: "已核销", tone: "success" },
};

export const WITHDRAWAL_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "审核中", tone: "warning" },
  PAID: { label: "已打款", tone: "success" },
  REJECTED: { label: "已驳回", tone: "danger" },
};

// 用户反馈类型 → 中文 + 色调。
export const FEEDBACK_TYPE_META: Record<string, { label: string; tone: Tone }> = {
  issue: { label: "遇到问题", tone: "warning" },
  idea: { label: "产品建议", tone: "brand" },
};

// 审计动作 → 中文。
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  USER_BAN: "封禁用户",
  USER_UNBAN: "解封用户",
  GRANT_CREDITS: "补积分",
  SET_PLAN: "改方案",
  ORDER_CONFIRM: "确认收款",
  ORDER_REFUND: "订单退款",
  OVERFLOW_SETTLE: "核销超额账单",
  AGENCY_CREATE: "开通代理",
  AGENCY_UPDATE: "调整代理",
  WITHDRAWAL_REVIEW: "审核提现",
  PARTNER_REVIEW: "审批代理申请",
};

// 代理商申请审核状态 → 中文 + 色调。
export const PARTNER_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "待审核", tone: "warning" },
  APPROVED: { label: "已通过", tone: "success" },
  REJECTED: { label: "已驳回", tone: "danger" },
};

// —— 后端返回类型 ——————————————————————————————————————————————

export type Dashboard = {
  userCount: number;
  newUsersToday: number;
  newUsers7d: number;
  bannedUserCount: number;
  workspaceCount: number;
  planDist: { free: number; pro: number; team: number };
  paidOrderCount: number;
  revenueTotalCents: number;
  revenueMonthCents: number;
  videoUsage: number;
  imageUsage: number;
  agentTaskUsage: number;
  pendingWithdrawals: number;
  pendingOverflowBills: number;
  agencyCount: number;
};

export type AdminUserRow = {
  id: string;
  phone: string;
  name?: string;
  createdAt: string;
  bannedAt?: string | null;
  plan: string;
  planExpiresAt?: string | null;
  workspaceId?: string | null;
  isAgency: boolean;
};

export type AdminUserList = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type UsageSummary = {
  plan: string;
  planExpiresAt?: string | null;
  periodStart: string;
  periodEnd: string;
  credits: { used: number; limit: number };
  breakdown: { agentTasks: number; videos: number; images: number };
};

export type AdminWorkspace = { id: string; name: string; slug: string; plan: string; planExpiresAt?: string | null };

export type AdminUserDetail = {
  user: {
    id: string;
    phone?: string | null;
    name?: string | null;
    createdAt: string;
    bannedAt?: string | null;
  };
  workspaces: { workspace: AdminWorkspace; usage?: UsageSummary }[];
  orders: Order[];
  invitedByCode?: string;
  isAgency: boolean;
};

export type Order = {
  id: string;
  workspaceId: string;
  userId: string;
  outTradeNo: string;
  plan: string;
  periodMonths: number;
  amountCents: number;
  provider: string;
  status: string;
  isMock: boolean;
  paidAt?: string | null;
  createdAt: string;
};

export type OverflowBill = {
  id: string;
  workspaceId: string;
  period: string;
  billableCredits: number;
  amountCents: number;
  status: string;
  note?: string;
  paidAt?: string | null;
  createdAt: string;
};

export type AuditLogRow = {
  log: {
    id: string;
    adminId: string;
    action: string;
    targetType: string;
    targetId: string;
    detail?: string;
    createdAt: string;
  };
  adminPhone: string;
};

export type FeedbackRow = {
  feedback: {
    id: string;
    userId: string;
    workspaceId?: string | null;
    type: string;
    content: string;
    pathname?: string;
    createdAt: string;
  };
  userPhone: string;
};

// 代理商申请。hasUser 为 false 时，审批通过会一并建号。
export type PartnerApplicationRow = {
  application: {
    id: string;
    name: string;
    phone: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  hasUser: boolean;
  agencyCode?: string;
};

// 代理商相关(沿用既有形状)。
export type Agency = {
  id: string;
  userId: string;
  code: string;
  commissionBp: number;
  status: string;
  note?: string;
  createdAt: string;
};

export type AdminAgencyRow = {
  agency: Agency;
  phone: string;
  customerCount: number;
  totalCommissionCents: number;
  balanceCents: number;
};

export type AdminWithdrawalRow = {
  withdrawal: {
    id: string;
    agencyId: string;
    amountCents: number;
    status: string;
    note?: string;
    createdAt: string;
  };
  phone: string;
};

export type AgencyOverview = {
  agencyCount: number;
  activeAgencyCount: number;
  referredUserCount: number;
  totalCommissionCents: number;
  pendingWithdrawalCount: number;
  pendingWithdrawalCents: number;
};
