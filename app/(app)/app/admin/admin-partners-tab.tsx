"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Handshake, Check, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { apiBrowser } from "@/lib/api-browser";
import type { Tone } from "@/lib/ui/tokens";
import { fmtDateTime, PARTNER_STATUS_META, type PartnerApplicationRow } from "./admin-shared";

type Resp = { rows: PartnerApplicationRow[]; total: number; page: number; pageSize: number };

const STATUS_OPTS = [
  { value: "PENDING", label: "待审核" },
  { value: "", label: "全部状态" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已驳回" },
];

export function PartnersTab() {
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(page));
    return apiBrowser<Resp>(`/admin/partner-applications?${params.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  async function review(id: string, approve: boolean, commissionBp: number) {
    try {
      await apiBrowser(`/admin/partner-applications/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ approve, commissionBp }),
      });
      toast.success(approve ? "已通过并开通代理商" : "已驳回");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败，稍后再试");
    }
  }

  return (
    <div className="space-y-3">
      <Toolbar>
        <Select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="w-36"
        >
          {STATUS_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Toolbar>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--dk-content-tertiary)]" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={status === "PENDING" ? "没有待审核的申请" : "暂无代理商申请"}
          description="访客在 /partners 落地页提交的代理商注册会汇总到这里。"
        />
      ) : (
        <>
          <TableWrap minWidth={760}>
            <THead>
              <Tr>
                <Th>申请时间</Th>
                <Th>代理商名称</Th>
                <Th>手机号</Th>
                <Th>状态</Th>
                <Th align="center">审批</Th>
              </Tr>
            </THead>
            <tbody>
              {data.rows.map((row) => (
                <PartnerRow key={row.application.id} row={row} onReview={review} />
              ))}
            </tbody>
          </TableWrap>
          <div className="flex items-center justify-between text-xs text-[var(--dk-content-tertiary)]">
            <span>共 {data.total} 条</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PartnerRow({
  row,
  onReview,
}: {
  row: PartnerApplicationRow;
  onReview: (id: string, approve: boolean, commissionBp: number) => Promise<void>;
}) {
  const { application: app } = row;
  const [percent, setPercent] = useState("20");
  const [busy, setBusy] = useState(false);
  const meta = PARTNER_STATUS_META[app.status] ?? { label: app.status, tone: "neutral" as Tone };
  const pending = app.status === "PENDING";

  async function act(approve: boolean) {
    const bp = Math.round(Number(percent) * 100);
    if (approve && (!Number.isFinite(bp) || bp <= 0 || bp > 10000)) {
      toast.error("佣金比例需在 0–100% 之间");
      return;
    }
    setBusy(true);
    try {
      await onReview(app.id, approve, bp);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tr>
      <Td className="whitespace-nowrap text-[var(--dk-content-secondary)]">{fmtDateTime(app.createdAt)}</Td>
      <Td className="text-[var(--dk-content-primary)]">{app.name}</Td>
      <Td className="font-mono">{app.phone}</Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {row.agencyCode && (
            <span className="font-mono text-2xs text-[var(--dk-content-tertiary)]">{row.agencyCode}</span>
          )}
          {pending && !row.hasUser && (
            <span
              title="该手机号尚无账号，通过时会自动建号"
              className="inline-flex items-center gap-0.5 text-2xs text-[var(--dk-content-tertiary)]"
            >
              <UserPlus className="h-3 w-3" /> 待建号
            </span>
          )}
        </div>
      </Td>
      <Td align="center">
        {pending ? (
          <div className="inline-flex items-center gap-1">
            <div className="relative w-16">
              <input
                type="number"
                min={0}
                max={100}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                title="佣金比例"
                className="nums w-full rounded-lg border border-[var(--dk-stroke-border)] py-1 pl-2 pr-5 text-right text-sm outline-none focus:ring-2 focus:ring-brand-200"
              />
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-2xs text-[var(--dk-content-tertiary)]">
                %
              </span>
            </div>
            {/* 通过/驳回带语义色:emerald 引导通过，中性底 hover 转 rose 表示驳回 */}
            <button
              disabled={busy}
              onClick={() => act(true)}
              title="通过并开通代理商"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-2xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} 通过
            </button>
            <button
              disabled={busy}
              onClick={() => act(false)}
              title="驳回"
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--dk-surface-2)] px-2.5 py-1 text-2xs font-medium text-[var(--dk-content-secondary)] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
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
