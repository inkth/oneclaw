"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { apiBrowser } from "@/lib/api-browser";
import { fmtDateTime, FEEDBACK_TYPE_META, type FeedbackRow } from "./admin-shared";

type Resp = { rows: FeedbackRow[]; total: number; page: number; pageSize: number };

const TYPE_OPTS = [
  { value: "", label: "全部类型" },
  { value: "issue", label: "遇到问题" },
  { value: "idea", label: "产品建议" },
];

export function FeedbackTab() {
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    params.set("page", String(page));
    return apiBrowser<Resp>(`/admin/feedback?${params.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [type, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <select
        value={type}
        onChange={(e) => {
          setPage(1);
          setType(e.target.value);
        }}
        className="rounded-lg border border-[var(--dk-stroke-border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
      >
        {TYPE_OPTS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--dk-content-tertiary)]" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="暂无用户反馈" description="用户从顶栏「反馈」入口提交的内容会汇总到这里。" />
      ) : (
        <>
          <TableWrap minWidth={720}>
            <THead>
              <Tr>
                <Th>时间</Th>
                <Th>用户</Th>
                <Th>类型</Th>
                <Th>内容</Th>
                <Th>页面</Th>
              </Tr>
            </THead>
            <tbody>
              {data.rows.map(({ feedback, userPhone }) => {
                const meta = FEEDBACK_TYPE_META[feedback.type];
                return (
                  <Tr key={feedback.id}>
                    <Td className="whitespace-nowrap text-[var(--dk-content-secondary)]">{fmtDateTime(feedback.createdAt)}</Td>
                    <Td className="font-mono text-2xs">{userPhone || feedback.userId.slice(0, 8)}</Td>
                    <Td>
                      <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? feedback.type}</Badge>
                    </Td>
                    <Td className="max-w-[360px] whitespace-pre-wrap break-words text-[var(--dk-content-primary)]">
                      {feedback.content}
                    </Td>
                    <Td className="max-w-[160px] truncate font-mono text-2xs text-[var(--dk-content-tertiary)]" title={feedback.pathname}>
                      {feedback.pathname || "—"}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
          <div className="flex items-center justify-between text-xs text-[var(--dk-content-tertiary)]">
            <span>共 {data.total} 条</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-[var(--dk-stroke-border)] px-2.5 py-1 disabled:opacity-40 hover:bg-[var(--dk-action-regular)]"
              >
                上一页
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[var(--dk-stroke-border)] px-2.5 py-1 disabled:opacity-40 hover:bg-[var(--dk-action-regular)]"
              >
                下一页
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
