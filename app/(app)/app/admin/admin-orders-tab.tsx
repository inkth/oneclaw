"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { SegmentedTabs } from "@/components/ui/Tabs";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { apiBrowser } from "@/lib/api-browser";
import {
  fmtDateTime,
  PLAN_LABEL,
  ORDER_META,
  OVERFLOW_META,
  type Order,
  type OverflowBill,
} from "./admin-shared";

type OrdersResp = { orders: Order[]; total: number; page: number; pageSize: number };
type BillsResp = { bills: OverflowBill[]; total: number; page: number; pageSize: number };

export function OrdersTab() {
  const [view, setView] = useState<"orders" | "bills">("orders");
  return (
    <div className="space-y-4">
      <SegmentedTabs
        items={[
          { value: "orders", label: "订阅订单" },
          { value: "bills", label: "超额账单" },
        ]}
        value={view}
        onValueChange={setView}
        ariaLabel="账单类型"
      />
      {view === "orders" ? <OrdersList /> : <BillsList />}
    </div>
  );
}

function OrdersList() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrdersResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(page));
    return apiBrowser<OrdersResp>(`/admin/orders?${params.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await apiBrowser(`/admin/orders/${id}/confirm`, { method: "POST" });
      toast.success("已确认收款,方案已升级");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function refund(id: string) {
    setBusyId(id);
    try {
      await apiBrowser(`/admin/orders/${id}/refund`, { method: "POST", body: JSON.stringify({ note: "后台退款" }) });
      toast.success("已标记退款");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <StatusFilter value={status} onChange={(s) => { setPage(1); setStatus(s); }} options={ORDER_STATUS_OPTS} />
      {loading && !data ? (
        <Spinner />
      ) : !data || data.orders.length === 0 ? (
        <EmptyState icon={RotateCcw} title="暂无订单" description="真实付费经线下转账,由此确认收款。" />
      ) : (
        <>
          <TableWrap minWidth={760}>
            <THead>
              <Tr>
                <Th>单号</Th>
                <Th>方案</Th>
                <Th align="right">金额</Th>
                <Th>状态</Th>
                <Th>时间</Th>
                <Th align="center">操作</Th>
              </Tr>
            </THead>
            <tbody>
              {data.orders.map((o) => {
                const meta = ORDER_META[o.status] ?? { label: o.status, tone: "neutral" as const };
                return (
                  <Tr key={o.id}>
                    <Td className="font-mono text-2xs text-[var(--dk-content-secondary)]">{o.outTradeNo}</Td>
                    <Td>{PLAN_LABEL[o.plan] ?? o.plan} ×{o.periodMonths}月</Td>
                    <Td align="right" className="nums font-medium text-[var(--dk-content-primary)]">¥{(o.amountCents / 100).toFixed(2)}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td className="text-[var(--dk-content-secondary)]">{fmtDateTime(o.createdAt)}</Td>
                    <Td align="center">
                      {o.status === "PENDING" ? (
                        <button
                          disabled={busyId === o.id}
                          onClick={() => confirm(o.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-2xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Check className="h-3 w-3" /> 确认收款
                        </button>
                      ) : o.status === "PAID" ? (
                        <button
                          disabled={busyId === o.id}
                          onClick={() => refund(o.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--dk-surface-2)] px-2.5 py-1 text-2xs font-medium text-[var(--dk-content-secondary)] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
                        >
                          <RotateCcw className="h-3 w-3" /> 退款
                        </button>
                      ) : (
                        <span className="text-2xs text-[var(--dk-content-tertiary)]">—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
          <Pager page={page} totalPages={totalPages} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function BillsList() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BillsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(page));
    return apiBrowser<BillsResp>(`/admin/overflow-bills?${params.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function settle(id: string) {
    setBusyId(id);
    try {
      await apiBrowser(`/admin/overflow-bills/${id}/settle`, { method: "POST", body: JSON.stringify({ note: "后台核销" }) });
      toast.success("已核销");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <StatusFilter value={status} onChange={(s) => { setPage(1); setStatus(s); }} options={BILL_STATUS_OPTS} />
      {loading && !data ? (
        <Spinner />
      ) : !data || data.bills.length === 0 ? (
        <EmptyState icon={RotateCcw} title="暂无超额账单" description="TEAM 超基线用量周期结算后在此核销。" />
      ) : (
        <>
          <TableWrap minWidth={680}>
            <THead>
              <Tr>
                <Th>账期</Th>
                <Th align="right">超额积分</Th>
                <Th align="right">金额</Th>
                <Th>状态</Th>
                <Th align="center">操作</Th>
              </Tr>
            </THead>
            <tbody>
              {data.bills.map((b) => {
                const meta = OVERFLOW_META[b.status] ?? { label: b.status, tone: "neutral" as const };
                return (
                  <Tr key={b.id}>
                    <Td className="font-mono text-[var(--dk-content-secondary)]">{b.period}</Td>
                    <Td align="right" className="nums">{b.billableCredits}</Td>
                    <Td align="right" className="nums font-medium text-[var(--dk-content-primary)]">¥{(b.amountCents / 100).toFixed(2)}</Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Td>
                    <Td align="center">
                      {b.status === "PENDING" ? (
                        <button
                          disabled={busyId === b.id}
                          onClick={() => settle(b.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-2xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Check className="h-3 w-3" /> 核销
                        </button>
                      ) : (
                        <span className="text-2xs text-[var(--dk-content-tertiary)]">已核销</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
          <Pager page={page} totalPages={totalPages} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

const ORDER_STATUS_OPTS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待支付" },
  { value: "PAID", label: "已支付" },
  { value: "REFUNDED", label: "已退款" },
  { value: "EXPIRED", label: "已过期" },
];
const BILL_STATUS_OPTS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待核销" },
  { value: "PAID", label: "已核销" },
];

function StatusFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Toolbar>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-36">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Toolbar>
  );
}

function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (updater: (p: number) => number) => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-[var(--dk-content-tertiary)]">
      <span>共 {total} 条</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPage((p) => p - 1)}
        >
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
          onClick={() => onPage((p) => p + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-[var(--dk-content-tertiary)]" />
    </div>
  );
}
