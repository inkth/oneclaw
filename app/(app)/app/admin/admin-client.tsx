"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Users,
  Coins,
  Wallet,
  Loader2,
  Plus,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { apiBrowser } from "@/lib/api-browser";
import type { Tone } from "@/lib/ui/tokens";

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

export type Overview = {
  agencyCount: number;
  activeAgencyCount: number;
  referredUserCount: number;
  totalCommissionCents: number;
  pendingWithdrawalCount: number;
  pendingWithdrawalCents: number;
};

function fmtYuan(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

// 提现状态 → 语义 tone,直接复用全站 STATUS_TONES(经 Badge 渲染),不再自带颜色 className。
const WITHDRAWAL_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "审核中", tone: "warning" },
  PAID: { label: "已打款", tone: "success" },
  REJECTED: { label: "已驳回", tone: "danger" },
};

export function AdminClient({
  overview: initialOverview,
  agencies: initialAgencies,
  withdrawals: initialWithdrawals,
}: {
  overview: Overview;
  agencies: AdminAgencyRow[];
  withdrawals: AdminWithdrawalRow[];
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [agencies, setAgencies] = useState(initialAgencies);
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);

  // 开通表单
  const [phone, setPhone] = useState("");
  const [percent, setPercent] = useState("20");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const [o, a, w] = await Promise.all([
        apiBrowser<{ overview: Overview }>("/admin/overview").then((r) => r.overview),
        apiBrowser<{ agencies: AdminAgencyRow[] }>("/admin/agencies").then((r) => r.agencies),
        apiBrowser<{ withdrawals: AdminWithdrawalRow[] }>("/admin/withdrawals").then((r) => r.withdrawals),
      ]);
      setOverview(o);
      setAgencies(a);
      setWithdrawals(w);
    } catch {
      /* 忽略 */
    }
  }

  async function createAgency() {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error("请输入合法的 11 位手机号");
      return;
    }
    const bp = Math.round(Number(percent) * 100);
    if (!Number.isFinite(bp) || bp <= 0 || bp > 10000) {
      toast.error("佣金比例需在 0–100% 之间");
      return;
    }
    setCreating(true);
    try {
      await apiBrowser("/admin/agencies", {
        method: "POST",
        body: JSON.stringify({ phone, commissionBp: bp }),
      });
      toast.success("已开通代理商");
      setPhone("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "开通失败");
    } finally {
      setCreating(false);
    }
  }

  async function updateAgency(id: string, body: { commissionBp?: number; status?: string }) {
    try {
      await apiBrowser(`/admin/agencies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("已更新");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function review(id: string, approve: boolean, note: string) {
    try {
      await apiBrowser(`/admin/withdrawals/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ approve, note }),
      });
      toast.success(approve ? "已标记打款" : "已驳回");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="管理后台"
        badge={
          <Badge tone="brand" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            仅管理员
          </Badge>
        }
        description="开通代理商、调整佣金比例、审核提现申请。"
      />

      {/* 总览 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={ShieldCheck} label="代理商" value={`${overview.activeAgencyCount}/${overview.agencyCount}`} hint="启用/总数" />
        <Stat icon={Users} label="绑定用户" value={overview.referredUserCount} />
        <Stat icon={Coins} label="累计佣金" value={fmtYuan(overview.totalCommissionCents)} />
        <Stat
          icon={Wallet}
          label="待审提现"
          value={overview.pendingWithdrawalCount}
          hint={overview.pendingWithdrawalCents > 0 ? fmtYuan(overview.pendingWithdrawalCents) : undefined}
        />
      </div>

      {/* 开通代理 */}
      <Card>
        <div className="text-sm font-medium text-[var(--dk-content-primary)]">开通代理商</div>
        <p className="mt-1 text-xs text-[var(--dk-content-secondary)]">按手机号开通。该手机号需已注册(登录过一次)。</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={11}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            placeholder="手机号"
            className="rounded-lg border border-[var(--dk-stroke-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200 sm:w-44"
          />
          <div className="flex items-center gap-2 rounded-lg border border-[var(--dk-stroke-border)] px-3 py-2 focus-within:ring-2 focus-within:ring-brand-200">
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="佣金比例"
              className="w-20 bg-transparent text-sm outline-none"
            />
            <span className="text-sm text-[var(--dk-content-secondary)]">%</span>
          </div>
          <button
            onClick={createAgency}
            disabled={creating}
            className="press inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--dk-btn-black)] px-4 py-2 text-sm font-medium text-white shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--dk-btn-black-hover)] disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            开通
          </button>
        </div>
      </Card>

      {/* 代理列表 */}
      <section>
        <div className="mb-2 text-sm font-medium text-[var(--dk-content-primary)]">代理商</div>
        {agencies.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="还没有代理商" description="用上方表单按手机号开通第一个代理商。" />
        ) : (
          <TableWrap minWidth={720}>
            <THead>
              <Tr>
                <Th>手机号</Th>
                <Th>邀请码</Th>
                <Th align="right">客户</Th>
                <Th align="right">累计佣金</Th>
                <Th align="right">余额</Th>
                <Th align="center">佣金比例</Th>
                <Th align="center">操作</Th>
              </Tr>
            </THead>
            <tbody>
              {agencies.map((row) => (
                <AgencyRow key={row.agency.id} row={row} onUpdate={updateAgency} />
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* 提现审核 */}
      <section>
        <div className="mb-2 text-sm font-medium text-[var(--dk-content-primary)]">提现申请</div>
        {withdrawals.length === 0 ? (
          <EmptyState icon={Wallet} title="暂无提现申请" description="代理商发起提现后会出现在这里等待审核。" />
        ) : (
          <TableWrap minWidth={720}>
            <THead>
              <Tr>
                <Th>手机号</Th>
                <Th>申请时间</Th>
                <Th align="right">金额</Th>
                <Th>收款/备注</Th>
                <Th>状态</Th>
                <Th align="center">审核</Th>
              </Tr>
            </THead>
            <tbody>
              {withdrawals.map((row) => (
                <WithdrawalRow key={row.withdrawal.id} row={row} onReview={review} />
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}

function AgencyRow({
  row,
  onUpdate,
}: {
  row: AdminAgencyRow;
  onUpdate: (id: string, body: { commissionBp?: number; status?: string }) => Promise<void>;
}) {
  const { agency } = row;
  const [percent, setPercent] = useState(String(agency.commissionBp / 100));
  const disabled = agency.status !== "ACTIVE";
  const changed = Math.round(Number(percent) * 100) !== agency.commissionBp;

  return (
    <Tr className={disabled ? "opacity-60" : undefined}>
      <Td className="font-mono">{row.phone || "—"}</Td>
      <Td className="font-mono text-[var(--dk-content-secondary)]">{agency.code}</Td>
      <Td align="right">{row.customerCount}</Td>
      <Td align="right">{fmtYuan(row.totalCommissionCents)}</Td>
      <Td align="right" className="font-medium text-[var(--dk-content-primary)]">{fmtYuan(row.balanceCents)}</Td>
      <Td align="center">
        <div className="inline-flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className="nums w-16 rounded-lg border border-[var(--dk-stroke-border)] px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-brand-200"
          />
          <span className="text-xs text-[var(--dk-content-tertiary)]">%</span>
          {changed && (
            <button
              onClick={() => {
                const bp = Math.round(Number(percent) * 100);
                if (bp > 0 && bp <= 10000) onUpdate(agency.id, { commissionBp: bp });
              }}
              className="press rounded-lg bg-[var(--dk-btn-black)] px-2 py-1 text-2xs font-medium text-white hover:bg-[var(--dk-btn-black-hover)]"
            >
              保存
            </button>
          )}
        </div>
      </Td>
      <Td align="center">
        {/* 启用/停用是带语义色的操作态,非纯装饰 hover:保留 emerald(启用引导)与中性 action-regular(停用) */}
        <button
          onClick={() => onUpdate(agency.id, { status: disabled ? "ACTIVE" : "DISABLED" })}
          className={`rounded-lg px-3 py-1 text-2xs font-medium transition-colors ${
            disabled
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-[var(--dk-surface-2)] text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)]"
          }`}
        >
          {disabled ? "启用" : "停用"}
        </button>
      </Td>
    </Tr>
  );
}

function WithdrawalRow({
  row,
  onReview,
}: {
  row: AdminWithdrawalRow;
  onReview: (id: string, approve: boolean, note: string) => Promise<void>;
}) {
  const { withdrawal: w } = row;
  const [note, setNote] = useState("");
  const meta = WITHDRAWAL_META[w.status] ?? { label: w.status, tone: "neutral" as Tone };
  const pending = w.status === "PENDING";

  return (
    <Tr>
      <Td className="font-mono">{row.phone || "—"}</Td>
      <Td className="text-[var(--dk-content-secondary)]">{fmtDate(w.createdAt)}</Td>
      <Td align="right" className="font-medium text-[var(--dk-content-primary)]">{fmtYuan(w.amountCents)}</Td>
      <Td className="max-w-[200px]">
        {pending ? (
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="打款凭证 / 驳回原因"
            className="w-full rounded-lg border border-[var(--dk-stroke-border)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-200"
          />
        ) : (
          <span className="truncate text-[var(--dk-content-secondary)]" title={w.note}>{w.note || "—"}</span>
        )}
      </Td>
      <Td>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </Td>
      <Td align="center">
        {pending ? (
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => onReview(w.id, true, note)}
              title="通过并标记已打款"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-2xs font-medium text-white hover:bg-emerald-700"
            >
              <Check className="h-3 w-3" /> 通过
            </button>
            <button
              onClick={() => onReview(w.id, false, note)}
              title="驳回"
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--dk-surface-2)] px-2.5 py-1 text-2xs font-medium text-[var(--dk-content-secondary)] hover:bg-rose-50 hover:text-rose-600"
            >
              <X className="h-3 w-3" /> 驳回
            </button>
          </div>
        ) : (
          <span className="text-2xs text-[var(--dk-content-tertiary)]">已处理</span>
        )}
      </Td>
    </Tr>
  );
}
