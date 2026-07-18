"use client";

import { useState } from "react";
import {
  Megaphone,
  Users,
  Wallet,
  Coins,
  Check,
  Copy,
  Loader2,
  BadgeCheck,
  MousePointerClick,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { apiBrowser } from "@/lib/api-browser";
import type { Tone } from "@/lib/ui/tokens";

export type AgencySummary = {
  code: string;
  status: string;
  commissionBp: number;
  clickCount: number;
  signupRate: number;
  customerCount: number;
  totalPaidCents: number;
  totalCommissionCents: number;
  balanceCents: number;
  pendingWithdrawalCents: number;
};

export type AgencyCustomer = {
  phone: string;
  boundAt: string;
  paidCents: number;
  commissionCents: number;
};

export type CommissionRecord = {
  id: string;
  userId: string;
  sourceType: string;
  baseAmountCents: number;
  commissionBp: number;
  amountCents: number;
  createdAt: string;
};

export type Withdrawal = {
  id: string;
  amountCents: number;
  status: string;
  note?: string;
  reviewedAt?: string | null;
  createdAt: string;
};

/** 分 → ¥x.xx */
export function fmtYuan(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const SOURCE_LABEL: Record<string, string> = {
  PAYMENT_ORDER: "订阅",
  OVERFLOW_BILL: "超额账单",
};

// 提现状态 → 语义 tone,直接复用全站 STATUS_TONES(经 Badge 渲染),不再自带颜色 className。
const WITHDRAWAL_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "审核中", tone: "warning" },
  PAID: { label: "已打款", tone: "success" },
  REJECTED: { label: "已驳回", tone: "danger" },
};

export function AgencyClient({
  summary: initialSummary,
  customers,
  commissions,
  withdrawals: initialWithdrawals,
}: {
  summary: AgencySummary;
  customers: AgencyCustomer[];
  commissions: CommissionRecord[];
  withdrawals: Withdrawal[];
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inviteLink =
    typeof window !== "undefined" ? `${window.location.origin}/r/${summary.code}` : `/r/${summary.code}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("邀请链接已复制");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("复制失败，请手动选择");
    }
  }

  async function refresh() {
    try {
      const [s, w] = await Promise.all([
        apiBrowser<{ summary: AgencySummary }>("/agency/summary").then((r) => r.summary),
        apiBrowser<{ withdrawals: Withdrawal[] }>("/agency/withdrawals").then((r) => r.withdrawals),
      ]);
      setSummary(s);
      setWithdrawals(w);
    } catch {
      /* 忽略刷新失败，下次进入页面自然对齐 */
    }
  }

  async function submitWithdrawal() {
    const yuan = Number(amount);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      toast.error("请输入有效的提现金额");
      return;
    }
    const cents = Math.round(yuan * 100);
    if (cents > summary.balanceCents) {
      toast.error("提现金额超过可提现余额");
      return;
    }
    setSubmitting(true);
    try {
      await apiBrowser("/agency/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amountCents: cents, note }),
      });
      toast.success("提现申请已提交，待管理员审核");
      setAmount("");
      setNote("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = summary.status !== "ACTIVE";

  return (
    <div className="space-y-6">
      <PageHeader
        title="推广中心"
        badge={
          disabled ? (
            <Badge tone="danger">已停用</Badge>
          ) : (
            <Badge tone="success" icon={<BadgeCheck className="h-3.5 w-3.5" />}>
              代理商
            </Badge>
          )
        }
        description={`每笔成交按 ${summary.commissionBp / 100}% 计佣，佣金进余额，可随时申请提现。`}
      />

      {/* 邀请链接 */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[var(--dk-content-secondary)]">
              <Megaphone className="h-3.5 w-3.5" />
              我的专属邀请链接
            </div>
            <div className="mt-1.5 truncate font-mono text-sm text-[var(--dk-content-primary)]" title={inviteLink}>
              {inviteLink}
            </div>
            <div className="mt-1 text-xs text-[var(--dk-content-tertiary)]">
              邀请码 <span className="font-mono font-medium text-[var(--dk-content-secondary)]">{summary.code}</span>
              ·客户首次打开后保留 30 天，首个有效代理商优先；新用户注册后永久绑定你并获赠新人积分
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={copyLink}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "已复制" : "复制链接"}
          </Button>
        </div>
      </Card>

      {/* 业绩卡 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat icon={MousePointerClick} label="链接访问" value={summary.clickCount} />
        <Stat icon={Percent} label="注册转化率" value={`${summary.signupRate}%`} />
        <Stat icon={Users} label="累计客户" value={summary.customerCount} />
        <Stat icon={Coins} label="客户累计付费" value={fmtYuan(summary.totalPaidCents)} />
        <Stat icon={BadgeCheck} label="累计佣金" value={fmtYuan(summary.totalCommissionCents)} />
        <Stat
          icon={Wallet}
          label="可提现余额"
          value={fmtYuan(summary.balanceCents)}
          hint={summary.pendingWithdrawalCents > 0 ? `审核中 ${fmtYuan(summary.pendingWithdrawalCents)}` : undefined}
        />
      </div>

      {/* 提现申请 */}
      <Card>
        <SectionHeader icon={Wallet} title="申请提现" />
        <p className="mt-1 text-xs text-[var(--dk-content-secondary)]">
          可提现余额 {fmtYuan(summary.balanceCents)}。提交后由管理员线下打款并标记结算。
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-40">
            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-[var(--dk-content-secondary)]">¥</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="提现金额"
              className="pl-7"
              disabled={disabled}
            />
          </div>
          <Input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="收款方式（如 微信 / 支付宝 / 银行卡）"
            className="flex-1"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="primary"
            onClick={submitWithdrawal}
            disabled={submitting || disabled || summary.balanceCents <= 0}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            提交申请
          </Button>
        </div>
      </Card>

      {/* 客户列表 */}
      <section>
        <SectionHeader icon={Users} title="客户列表" meta={`${customers.length} 位`} />
        {customers.length === 0 ? (
          <EmptyState icon={Users} title="还没有客户" description="把邀请链接分享出去，客户注册后会出现在这里。" />
        ) : (
          <TableWrap minWidth={560}>
            <THead>
              <Tr>
                <Th>客户</Th>
                <Th>绑定时间</Th>
                <Th align="right">累计付费</Th>
                <Th align="right">带来佣金</Th>
              </Tr>
            </THead>
            <tbody>
              {customers.map((c, i) => (
                <Tr key={i}>
                  <Td className="font-mono">{c.phone}</Td>
                  <Td className="text-[var(--dk-content-secondary)]">{fmtDate(c.boundAt)}</Td>
                  <Td align="right">{fmtYuan(c.paidCents)}</Td>
                  <Td align="right" className="font-medium text-[var(--dk-content-primary)]">{fmtYuan(c.commissionCents)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* 佣金流水 */}
      <section>
        <SectionHeader icon={Coins} title="佣金流水" meta={`${commissions.length} 条`} />
        {commissions.length === 0 ? (
          <EmptyState icon={Coins} title="暂无佣金" description="客户完成付费后，佣金会实时入账。" />
        ) : (
          <TableWrap minWidth={620}>
            <THead>
              <Tr>
                <Th>时间</Th>
                <Th>来源</Th>
                <Th align="right">成交金额</Th>
                <Th align="right">比例</Th>
                <Th align="right">佣金</Th>
              </Tr>
            </THead>
            <tbody>
              {commissions.map((r) => (
                <Tr key={r.id}>
                  <Td className="text-[var(--dk-content-secondary)]">{fmtDate(r.createdAt)}</Td>
                  <Td>{SOURCE_LABEL[r.sourceType] ?? r.sourceType}</Td>
                  <Td align="right">{fmtYuan(r.baseAmountCents)}</Td>
                  <Td align="right" className="text-[var(--dk-content-secondary)]">{r.commissionBp / 100}%</Td>
                  <Td align="right" className="font-medium text-[var(--dk-content-primary)]">{fmtYuan(r.amountCents)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* 提现记录 */}
      <section>
        <SectionHeader icon={Wallet} title="提现记录" meta={`${withdrawals.length} 条`} />
        {withdrawals.length === 0 ? (
          <EmptyState icon={Wallet} title="暂无提现" description="佣金累积后可发起提现申请。" />
        ) : (
          <TableWrap minWidth={560}>
            <THead>
              <Tr>
                <Th>申请时间</Th>
                <Th align="right">金额</Th>
                <Th>状态</Th>
                <Th>备注</Th>
              </Tr>
            </THead>
            <tbody>
              {withdrawals.map((w) => {
                const meta = WITHDRAWAL_META[w.status] ?? { label: w.status, tone: "neutral" as Tone };
                return (
                  <Tr key={w.id}>
                    <Td className="text-[var(--dk-content-secondary)]">{fmtDate(w.createdAt)}</Td>
                    <Td align="right" className="font-medium text-[var(--dk-content-primary)]">{fmtYuan(w.amountCents)}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td className="max-w-[220px] truncate text-[var(--dk-content-secondary)]" title={w.note}>{w.note || "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
