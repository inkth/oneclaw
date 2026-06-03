"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Trash2, Video as VideoIcon, Loader2 } from "lucide-react";
import { DispatchButton } from "@/components/DispatchButton";

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
    const res = await fetch(
      `/api/workspaces/${workspaceId}/products/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const json = await res.json();
    setBusyId(null);
    if (!res.ok || !json.ok) {
      setError(json?.error?.message || "更新失败");
      return;
    }
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...json.data.product } : p)),
    );
  }

  async function deleteProduct(id: string) {
    if (!confirm("确定删除？该选品产生的视频会保留但不再关联。")) return;
    setBusyId(id);
    const res = await fetch(
      `/api/workspaces/${workspaceId}/products/${id}`,
      { method: "DELETE" },
    );
    const json = await res.json();
    setBusyId(null);
    if (!res.ok || !json.ok) {
      setError(json?.error?.message || "删除失败");
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">选品库</h1>
          <p className="mt-1 text-sm text-zinc-500">
            市场分析师 Agent 推荐与你手动加入的潜力品类。
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full p-0.5 self-start">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {f.label}
              <span className="ml-1 text-[10px] text-zinc-400">
                {f.key === "ALL"
                  ? products.length
                  : products.filter((p) => p.status === f.key).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <div className="text-base font-semibold">
            {filter === "ALL" ? "还没有选品" : "这个分类下还没有选品"}
          </div>
          <p className="mt-1.5 text-sm text-zinc-500">
            前往 <span className="text-indigo-600">Agent 工作流</span>，让市场分析师扫描热门品类。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-zinc-50/60 text-xs text-zinc-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">商品</th>
                <th className="text-left font-medium px-4 py-3">店铺</th>
                <th className="text-left font-medium px-4 py-3">品类</th>
                <th className="text-right font-medium px-4 py-3">ROI</th>
                <th className="text-right font-medium px-4 py-3">毛利率</th>
                <th className="text-right font-medium px-4 py-3">月销</th>
                <th className="text-right font-medium px-4 py-3">14d</th>
                <th className="text-center font-medium px-4 py-3">状态</th>
                <th className="text-right font-medium px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-100 to-rose-100 flex items-center justify-center text-lg">
                        {p.emoji ?? "📦"}
                      </div>
                      <div>
                        <div className="font-medium" title={p.note ?? undefined}>{p.title}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          ${(p.priceCents / 100).toFixed(2)} · 成本 $
                          {(p.costCents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {p.shop ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px]">
                        {p.shop.name}
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{p.category}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    {p.roiScore}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.marginPct}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.monthlySales.toLocaleString()}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      p.trendDelta >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {p.trendDelta >= 0 ? "↑" : "↓"} {Math.abs(p.trendDelta)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMap[p.status].cls}`}
                    >
                      {statusMap[p.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status !== "ARCHIVED" && (
                        <DispatchButton
                          workspaceId={workspaceId}
                          agent="DIRECTOR"
                          input={`productId=${p.id} 为这个产品生成 4 套差异化短视频`}
                          size="xs"
                        />
                      )}
                      {p.status === "ARCHIVED" ? (
                        <button
                          onClick={() => patchProduct(p.id, { status: "EVALUATING" })}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                          title="恢复"
                        >
                          {busyId === p.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => patchProduct(p.id, { status: "ARCHIVED" })}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                          title="归档"
                        >
                          {busyId === p.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Archive className="h-2.5 w-2.5" />}
                        </button>
                      )}
                      <button
                        onClick={() => deleteProduct(p.id)}
                        disabled={busyId === p.id}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                        title="删除"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filter === "ALL" && products.filter((p) => p.status === "RECOMMENDED").length > 0 && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                <VideoIcon className="h-4 w-4" />
                批量动作
              </div>
              <p className="mt-1 text-xs text-violet-700">
                把所有「推荐」品类的视频脚本一次出齐？让运营官给你排好本周日程？
              </p>
            </div>
            <DispatchButton
              workspaceId={workspaceId}
              agent="OPERATOR"
              input="基于当前工作台所有视频，排一份本周三平台发布日历"
              size="sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
