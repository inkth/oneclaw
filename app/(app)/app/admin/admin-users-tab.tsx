"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Ban, ShieldCheck, Loader2, Coins, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogShell } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { apiBrowser } from "@/lib/api-browser";
import {
  fmtDate,
  fmtDateTime,
  PLAN_LABEL,
  PLAN_TONE,
  ORDER_META,
  type AdminUserList,
  type AdminUserRow,
  type AdminUserDetail,
} from "./admin-shared";

const PLAN_FILTERS = [
  { value: "", label: "全部" },
  { value: "FREE", label: "免费版" },
  { value: "PRO", label: "专业版" },
  { value: "TEAM", label: "旗舰版" },
];

export function UsersTab() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [onlyBanned, setOnlyBanned] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 取数用 .then 链(而非 async/await):setState 只在 promise 回调里发生,
  // 避免 react-hooks/set-state-in-effect 报错(与仓库既有 usePersonas 模式一致)。
  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (plan) params.set("plan", plan);
    if (onlyBanned) params.set("banned", "1");
    params.set("page", String(page));
    return apiBrowser<AdminUserList>(`/admin/users?${params.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [q, plan, onlyBanned, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <Toolbar>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--dk-content-tertiary)]" />
          <Input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="搜手机号"
            className="w-44 pl-9"
          />
        </div>
        <Select
          value={plan}
          onChange={(e) => {
            setPage(1);
            setPlan(e.target.value);
          }}
          className="w-32"
        >
          {PLAN_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <button
          onClick={() => {
            setPage(1);
            setOnlyBanned((v) => !v);
          }}
          className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors ${
            onlyBanned
              ? "border-rose-200 bg-rose-50 text-rose-600"
              : "border-[var(--dk-stroke-border)] text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)]"
          }`}
        >
          <Ban className="h-3.5 w-3.5" /> 仅封禁
        </button>
      </Toolbar>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--dk-content-tertiary)]" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={Search} title="没有匹配的用户" description="换个手机号或筛选条件试试。" />
      ) : (
        <>
          <TableWrap minWidth={840}>
            <THead>
              <Tr>
                <Th>手机号</Th>
                <Th>昵称</Th>
                <Th>方案</Th>
                <Th>到期</Th>
                <Th>注册</Th>
                <Th align="center">身份</Th>
                <Th align="center">操作</Th>
              </Tr>
            </THead>
            <tbody>
              {data.rows.map((u) => (
                <UserRow key={u.id} u={u} onOpen={() => setDetailId(u.id)} />
              ))}
            </tbody>
          </TableWrap>

          {/* 分页 */}
          <div className="flex items-center justify-between text-xs text-[var(--dk-content-tertiary)]">
            <span>共 {data.total} 人</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
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
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}

      {detailId && (
        <UserDetailModal
          userId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function UserRow({ u, onOpen }: { u: AdminUserRow; onOpen: () => void }) {
  const banned = !!u.bannedAt;
  return (
    <Tr className={banned ? "opacity-60" : undefined}>
      <Td className="font-mono">
        {u.phone || "—"}
        {banned && <span className="ml-2 text-2xs text-rose-500">已封禁</span>}
      </Td>
      <Td className="text-[var(--dk-content-secondary)]">{u.name || "—"}</Td>
      <Td>
        <Badge tone={PLAN_TONE[u.plan] ?? "neutral"}>{PLAN_LABEL[u.plan] ?? u.plan}</Badge>
      </Td>
      <Td className="text-[var(--dk-content-secondary)]">{u.plan === "FREE" ? "—" : fmtDate(u.planExpiresAt)}</Td>
      <Td className="text-[var(--dk-content-secondary)]">{fmtDate(u.createdAt)}</Td>
      <Td align="center">
        {u.isAgency ? (
          <Badge tone="brand" icon={<ShieldCheck className="h-3 w-3" />}>
            代理
          </Badge>
        ) : (
          <span className="text-2xs text-[var(--dk-content-tertiary)]">—</span>
        )}
      </Td>
      <Td align="center">
        <button
          onClick={onOpen}
          className="press rounded-lg bg-[var(--dk-surface-2)] px-3 py-1 text-2xs font-medium text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)]"
        >
          详情
        </button>
      </Td>
    </Tr>
  );
}

function UserDetailModal({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    return apiBrowser<AdminUserDetail>(`/admin/users/${userId}`)
      .then(setD)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "加载失败");
        onClose();
      });
  }, [userId, onClose]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function act(path: string, body: object, ok: string) {
    setBusy(true);
    try {
      await apiBrowser(path, { method: "POST", body: JSON.stringify(body) });
      toast.success(ok);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const banned = !!d?.user.bannedAt;

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="admin-user-detail-title"
      describedBy="admin-user-detail-meta"
      panelClassName="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto p-5 sm:max-h-[calc(100vh-4rem)]"
    >
        <div className="flex items-start justify-between pr-10">
          <div>
            <div id="admin-user-detail-title" className="font-mono text-base font-medium text-[var(--dk-content-primary)]">
              {d?.user.phone || "用户"}
            </div>
            <div id="admin-user-detail-meta" className="mt-0.5 text-xs text-[var(--dk-content-tertiary)]">
              注册 {fmtDate(d?.user.createdAt)}
              {d?.invitedByCode && ` · 邀请码 ${d.invitedByCode}`}
              {d?.isAgency && " · 代理商"}
            </div>
          </div>
        </div>

        {!d ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--dk-content-tertiary)]" />
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* 封禁 */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--dk-stroke-border)] px-3 py-2.5">
              <div className="text-sm">
                <span className="font-medium text-[var(--dk-content-primary)]">账号状态</span>
                <span className={`ml-2 text-xs ${banned ? "text-rose-500" : "text-emerald-600"}`}>
                  {banned ? "已封禁" : "正常"}
                </span>
              </div>
              {banned ? (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(`/admin/users/${userId}/unban`, {}, "已解封")}>
                  解封
                </Button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => act(`/admin/users/${userId}/ban`, { reason: "" }, "已封禁")}
                  className="press inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                >
                  <Ban className="h-3.5 w-3.5" /> 封禁
                </button>
              )}
            </div>

            {/* 工作台 + 用量 + 运营操作 */}
            {d.workspaces.map(({ workspace: w, usage }) => (
              <WorkspaceBlock key={w.id} wsId={w.id} name={w.name} plan={w.plan} usage={usage} busy={busy} act={act} />
            ))}

            {/* 订单 */}
            <div>
              <div className="mb-2 text-sm font-medium text-[var(--dk-content-primary)]">最近订单</div>
              {d.orders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--dk-stroke-border)] px-3 py-4 text-center text-xs text-[var(--dk-content-tertiary)]">
                  暂无订单
                </div>
              ) : (
                <TableWrap minWidth={420}>
                  <THead>
                    <Tr>
                      <Th>方案</Th>
                      <Th align="right">金额</Th>
                      <Th>状态</Th>
                      <Th>时间</Th>
                    </Tr>
                  </THead>
                  <tbody>
                    {d.orders.map((o) => {
                      const meta = ORDER_META[o.status] ?? { label: o.status, tone: "neutral" as const };
                      return (
                        <Tr key={o.id}>
                          <Td>{PLAN_LABEL[o.plan] ?? o.plan} ×{o.periodMonths}月</Td>
                          <Td align="right" className="nums">¥{(o.amountCents / 100).toFixed(2)}</Td>
                          <Td>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </Td>
                          <Td className="text-[var(--dk-content-secondary)]">{fmtDateTime(o.createdAt)}</Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )}
            </div>
          </div>
        )}
    </DialogShell>
  );
}

function WorkspaceBlock({
  wsId,
  name,
  plan,
  usage,
  busy,
  act,
}: {
  wsId: string;
  name: string;
  plan: string;
  usage?: AdminUserDetail["workspaces"][number]["usage"];
  busy: boolean;
  act: (path: string, body: object, ok: string) => Promise<void>;
}) {
  const [credits, setCredits] = useState("");
  const [planSel, setPlanSel] = useState(plan);
  const [months, setMonths] = useState("1");

  const used = usage?.credits.used ?? 0;
  const limit = usage?.credits.limit ?? 0;

  return (
    <div className="rounded-lg border border-[var(--dk-stroke-border)] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-[var(--dk-content-primary)]">{name}</div>
        <Badge tone={PLAN_TONE[plan] ?? "neutral"}>{PLAN_LABEL[plan] ?? plan}</Badge>
      </div>
      {usage && (
        <div className="mt-1.5 text-xs text-[var(--dk-content-secondary)]">
          本周期积分 {used}
          {limit < 0 ? " / 不限" : ` / ${limit}`} · 出片 {usage.breakdown.videos} · 出图 {usage.breakdown.images} · 任务{" "}
          {usage.breakdown.agentTasks}
        </div>
      )}

      {/* 补积分 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Coins className="h-3.5 w-3.5 text-[var(--dk-content-tertiary)]" />
        <input
          type="number"
          min={1}
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          placeholder="补积分数"
          className="w-24 rounded-lg border border-[var(--dk-stroke-border)] px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          disabled={busy}
          onClick={() => {
            const n = Math.round(Number(credits));
            if (!Number.isFinite(n) || n <= 0) {
              toast.error("请输入正整数积分");
              return;
            }
            act(`/admin/workspaces/${wsId}/grant-credits`, { credits: n, note: "后台补偿" }, "已补积分");
            setCredits("");
          }}
          className="press rounded-lg bg-[var(--dk-surface-2)] px-2.5 py-1 text-2xs font-medium text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)] disabled:opacity-60"
        >
          补发(本周期)
        </button>
      </div>

      {/* 改方案 */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ArrowUpCircle className="h-3.5 w-3.5 text-[var(--dk-content-tertiary)]" />
        <select
          value={planSel}
          onChange={(e) => setPlanSel(e.target.value)}
          className="rounded-lg border border-[var(--dk-stroke-border)] bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-200"
        >
          <option value="FREE">免费版</option>
          <option value="PRO">专业版</option>
          <option value="TEAM">旗舰版</option>
        </select>
        {planSel !== "FREE" && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="w-14 rounded-lg border border-[var(--dk-stroke-border)] px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-brand-200"
            />
            <span className="text-2xs text-[var(--dk-content-tertiary)]">月</span>
          </div>
        )}
        <button
          disabled={busy}
          onClick={() =>
            act(
              `/admin/workspaces/${wsId}/plan`,
              { plan: planSel, months: Math.max(1, Math.round(Number(months))), note: "后台调整" },
              "已改方案"
            )
          }
          className="press rounded-lg bg-[var(--dk-btn-black)] px-2.5 py-1 text-2xs font-medium text-white hover:bg-[var(--dk-btn-black-hover)] disabled:opacity-60"
        >
          应用
        </button>
      </div>
    </div>
  );
}
