"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Trash2, Loader2, Package } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaPlaceholder } from "@/components/ui/MediaPlaceholder";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Delta } from "@/components/ui/Delta";

type Status = "RECOMMENDED" | "EVALUATING" | "ARCHIVED";

type Product = {
  id: string;
  title: string;
  category: string;
  emoji: string | null;
  priceCents: number;
  costCents: number;
  marginPct: number;
  roiScore: number;
  monthlySales: number;
  trendDelta: number;
  status: Status;
  note: string | null;
  shop: { id: string; name: string; platform: string } | null;
};

const statusMap: Record<Status, { label: string; cls: string }> = {
  RECOMMENDED: { label: "推荐", cls: "bg-emerald-50 text-emerald-700" },
  EVALUATING: { label: "评估中", cls: "bg-amber-50 text-amber-700" },
  ARCHIVED: { label: "已归档", cls: "bg-zinc-100 text-zinc-500" },
};

const filters: Array<{ key: "ALL" | Status; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "RECOMMENDED", label: "推荐" },
  { key: "EVALUATING", label: "评估中" },
  { key: "ARCHIVED", label: "归档" },
];

export function ProductsClient({
  workspaceId,
  initialProducts,
}: {
  workspaceId: string;
  initialProducts: Product[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible =
    filter === "ALL" ? products : products.filter((p) => p.status === filter);

  async function patchProduct(id: string, patch: Partial<Product>) {
    setBusyId(id);
    setError(null);
    try {
      const data = await apiBrowser<{ product: Product }>(
        `/workspaces/${workspaceId}/products/${id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.product } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("确定删除？")) return;
    setBusyId(id);
    try {
      await apiBrowser(`/workspaces/${workspaceId}/products/${id}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="选品库"
        description="市场分析师 Agent 推荐与你手动加入的潜力品类。"
        actions={
          <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full p-0.5 self-start">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-zinc-600 hover:text-brand-700"
                }`}
              >
                {f.label}
                <span className={`ml-1 text-2xs ${filter === f.key ? "text-brand-200" : "text-zinc-400"}`}>
                  {f.key === "ALL"
                    ? products.length
                    : products.filter((p) => p.status === f.key).length}
                </span>
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title={filter === "ALL" ? "还没有选品" : "这个分类下还没有选品"}
          description={
            <>
              前往 <span className="text-brand-600">Agent 工作流</span>，让市场分析师扫描热门品类。
            </>
          }
        />
      ) : (
        <TableWrap minWidth={760}>
            <THead>
              <tr>
                <Th>商品</Th>
                <Th>店铺</Th>
                <Th>品类</Th>
                <Th align="right">ROI</Th>
                <Th align="right">毛利率</Th>
                <Th align="right">月销</Th>
                <Th align="right">14d</Th>
                <Th align="center">状态</Th>
                <Th align="right">操作</Th>
              </tr>
            </THead>
            <tbody>
              {visible.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <MediaPlaceholder seed={p.id} rounded="rounded-lg" className="h-9 w-9 shrink-0" />
                      <div>
                        <div className="font-medium" title={p.note ?? undefined}>{p.title}</div>
                        <div className="text-2xs text-zinc-500 font-mono nums">
                          ${(p.priceCents / 100).toFixed(2)} · 成本 $
                          {(p.costCents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-zinc-600">
                    {p.shop ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-2xs">
                        {p.shop.name}
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </Td>
                  <Td className="text-zinc-600">{p.category}</Td>
                  <Td align="right" className="font-semibold nums">
                    {p.roiScore}
                  </Td>
                  <Td align="right" className="nums">
                    {p.marginPct}%
                  </Td>
                  <Td align="right" className="nums">
                    {p.monthlySales.toLocaleString()}
                  </Td>
                  <Td align="right" className="nums">
                    <Delta value={p.trendDelta} title="近 14 天变化" className="text-xs" />
                  </Td>
                  <Td align="center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${statusMap[p.status].cls}`}
                    >
                      {statusMap[p.status].label}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === "ARCHIVED" ? (
                        <button
                          onClick={() => patchProduct(p.id, { status: "EVALUATING" })}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-2xs text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                          title="恢复"
                        >
                          {busyId === p.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => patchProduct(p.id, { status: "ARCHIVED" })}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-2xs text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                          title="归档"
                        >
                          {busyId === p.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Archive className="h-2.5 w-2.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => deleteProduct(p.id)}
                        disabled={busyId === p.id}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-2xs text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                        title="删除"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
        </TableWrap>
      )}

    </div>
  );
}
