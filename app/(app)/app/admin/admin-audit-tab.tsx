"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { apiBrowser } from "@/lib/api-browser";
import { fmtDateTime, AUDIT_ACTION_LABEL, type AuditLogRow } from "./admin-shared";

type Resp = { logs: AuditLogRow[]; total: number; page: number; pageSize: number };

const ACTION_OPTS = [
  { value: "", label: "全部操作" },
  ...Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ value, label })),
];

export function AuditTab() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    params.set("page", String(page));
    return apiBrowser<Resp>(`/admin/audit-logs?${params.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [action, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <Toolbar>
        <Select
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          className="w-44"
        >
          {ACTION_OPTS.map((o) => (
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
      ) : !data || data.logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="暂无操作记录" description="管理员的每次写操作都会留痕于此。" />
      ) : (
        <>
          <TableWrap minWidth={720}>
            <THead>
              <Tr>
                <Th>时间</Th>
                <Th>操作人</Th>
                <Th>操作</Th>
                <Th>对象</Th>
                <Th>详情</Th>
              </Tr>
            </THead>
            <tbody>
              {data.logs.map(({ log, adminPhone }) => (
                <Tr key={log.id}>
                  <Td className="whitespace-nowrap text-[var(--dk-content-secondary)]">{fmtDateTime(log.createdAt)}</Td>
                  <Td className="font-mono text-2xs">{adminPhone || log.adminId.slice(0, 8)}</Td>
                  <Td className="font-medium text-[var(--dk-content-primary)]">{AUDIT_ACTION_LABEL[log.action] ?? log.action}</Td>
                  <Td className="font-mono text-2xs text-[var(--dk-content-tertiary)]">
                    {log.targetType}/{log.targetId.slice(0, 8)}
                  </Td>
                  <Td className="max-w-[280px] truncate text-[var(--dk-content-secondary)]" title={log.detail}>
                    {log.detail || "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="flex items-center justify-between text-xs text-[var(--dk-content-tertiary)]">
            <span>共 {data.total} 条</span>
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
    </div>
  );
}
