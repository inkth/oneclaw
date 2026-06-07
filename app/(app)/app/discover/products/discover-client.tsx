"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import { LoginPromptModal } from "@/components/LoginPromptModal";
import { FilterBar, type CategoryOption, type FieldOption } from "../_components/FilterBar";
import {
  Sparkles,
  Plus,
  Loader2,
  Star,
  Database,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
} from "lucide-react";

type Region = "US" | "GB" | "ID" | "TH" | "VN" | "MY";
type RankType = 1 | 2 | 3;
type Field = 1 | 2 | 3;

type AnalysisInfo = {
  taskId: string;
  status: string;
  createdAt: string;
  verdict?: string;
};

type Interaction = { isStarred: boolean; tags: string[] };

type DiscoverProduct = {
  productId: string;
  productName: string;
  region: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  commissionRate: number;
  totalSaleCnt: number;
  totalSaleGmvAmt: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  totalLiveCnt: number;
  coverUrl: string | null;
  trend7dPct: number | null;
  importedProductId: string | null;
  analysis: AnalysisInfo | null;
  interaction: Interaction | null;
};

// 商品榜排序支持 3 项(店铺/达人/视频只有销量/GMV)。
const PRODUCT_FIELDS: FieldOption[] = [
  { v: 1, cn: "销量" },
  { v: 2, cn: "GMV" },
  { v: 3, cn: "增长" },
];

// 把字符串映射成确定的渐变色（同名产品颜色稳定）—— 给商品 cell 当占位封面
function stringToGradient(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 70% 55%), hsl(${hue2} 70% 65%))`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

type DiscoverState = "live" | "cached" | "empty" | "mock" | "error";

export function DiscoverClient({
  workspaceId,
  region,
  rankType,
  field,
  categoryId,
  categories,
  state,
  fetchedAt,
  products,
  isGuest = false,
}: {
  workspaceId: string;
  region: Region;
  rankType: RankType;
  field: Field;
  categoryId: string | null;
  categories: CategoryOption[];
  state: DiscoverState;
  fetchedAt: string | null;
  products: DiscoverProduct[];
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [loginOpen, setLoginOpen] = useState(false);

  // 游客触发「导入/收藏/分析」时拦下来弹登录浮层。返回 true 表示已拦截。
  function gateGuest(): boolean {
    if (!isGuest) return false;
    setLoginOpen(true);
    return true;
  }

  async function importProduct(p: DiscoverProduct) {
    if (importing.has(p.productId)) return;
    if (gateGuest()) return;
    setImporting((prev) => new Set(prev).add(p.productId));
    try {
      const data = await apiBrowser<{ alreadyExists: boolean }>(
        `/workspaces/${workspaceId}/discover/import-product`,
        {
          method: "POST",
          body: JSON.stringify({
            productId: p.productId,
            region: p.region,
            categoryLabel: "TikTok 爆品",
          }),
        },
      );
      if (data.alreadyExists) {
        toast(`选品库里已经有了：${p.productName.slice(0, 30)}…`);
      } else {
        toast.success(`已加入选品库：${p.productName.slice(0, 30)}…`);
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setImporting((prev) => {
        const n = new Set(prev);
        n.delete(p.productId);
        return n;
      });
    }
  }

  const [starring, setStarring] = useState<Set<string>>(new Set());
  const [stars, setStars] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const p of products) m[p.productId] = p.interaction?.isStarred ?? false;
    return m;
  });

  async function toggleStar(p: DiscoverProduct) {
    if (starring.has(p.productId)) return;
    if (gateGuest()) return;
    const next = !stars[p.productId];
    setStarring((prev) => new Set(prev).add(p.productId));
    setStars((prev) => ({ ...prev, [p.productId]: next }));
    try {
      await apiBrowser(`/workspaces/${workspaceId}/discover/interactions`, {
        method: "POST",
        body: JSON.stringify({ externalId: p.productId, region: p.region, isStarred: next }),
      });
      if (next) toast.success("已收藏");
    } catch {
      setStars((prev) => ({ ...prev, [p.productId]: !next }));
      toast.error("收藏失败");
    } finally {
      setStarring((prev) => {
        const n = new Set(prev);
        n.delete(p.productId);
        return n;
      });
    }
  }

  // AI 可行性分析:派发 ANALYST 任务 → 轮询 → 弹出判定结果。
  async function analyzeProduct(p: DiscoverProduct) {
    if (analyzing.has(p.productId)) return;
    if (gateGuest()) return;
    setAnalyzing((prev) => new Set(prev).add(p.productId));
    try {
      const start = await apiBrowser<{ task: { id: string } }>(
        `/workspaces/${workspaceId}/discover/analyze`,
        { method: "POST", body: JSON.stringify({ productId: p.productId, region: p.region }) },
      );
      const taskId = start.task.id;
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const cur = await apiBrowser<{ task: { status: string; output: string | null } }>(
          `/workspaces/${workspaceId}/agent-tasks/${taskId}`,
        );
        if (cur.task.status === "DONE") {
          toast.success(`分析完成：${p.productName.slice(0, 20)}…`, {
            description: cur.task.output ?? undefined,
            duration: 12000,
          });
          return;
        }
        if (cur.task.status === "FAILED") {
          toast.error("分析失败", { description: cur.task.output ?? "请稍后重试" });
          return;
        }
      }
      toast.message("分析仍在进行", { description: "稍后可在工作台查看结果" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzing((prev) => {
        const n = new Set(prev);
        n.delete(p.productId);
        return n;
      });
    }
  }

  return (
    <div className="space-y-6">
      {loginOpen && (
        <LoginPromptModal
          onClose={() => setLoginOpen(false)}
          callbackUrl="/app/discover/products"
          title="登录后即可操作"
          desc="导入选品、收藏、AI 分析都需要账号。趋势榜随便逛,登录后一键操作。"
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            发现 · TikTok 爆品
            {state === "mock" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                <Database className="h-2.5 w-2.5" />
                Mock 数据
              </span>
            )}
            {state === "live" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                <Database className="h-2.5 w-2.5" />
                EchoTik 实时
              </span>
            )}
            {state === "cached" && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 border border-sky-200"
                title={fetchedAt ? `缓存于 ${new Date(fetchedAt).toLocaleString("zh-CN")}` : undefined}
              >
                <Database className="h-2.5 w-2.5" />
                本地缓存
              </span>
            )}
            {state === "error" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 border border-rose-200">
                <AlertTriangle className="h-2.5 w-2.5" />
                EchoTik 异常 · 已降级
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            来自 EchoTik 的 TikTok Shop 真实销售数据 · 点商品行查看趋势 · 一键派给分析师做深度判断
          </p>
        </div>
      </div>

      {state === "mock" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800 leading-relaxed">
            当前是 mock 数据。在 <code className="rounded bg-amber-100 px-1">.env.local</code> 填上
            <code className="ml-1 rounded bg-amber-100 px-1">ECHOTIK_USERNAME</code> +
            <code className="ml-1 rounded bg-amber-100 px-1">ECHOTIK_PASSWORD</code>，刷新即可拉真实榜单。
          </div>
        </div>
      )}

      <FilterBar
        basePath="/app/discover/products"
        region={region}
        rankType={rankType}
        field={field}
        fields={PRODUCT_FIELDS}
        categoryId={categoryId}
        categories={categories}
      />

      {state === "empty" && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <div className="text-base font-semibold">该榜单暂无数据</div>
          <p className="mt-1.5 text-sm text-zinc-500 max-w-md mx-auto">
            EchoTik 这个区域 / 榜单组合下还没有可用数据（可能 T-1 数据未生成，或当前账号订阅未覆盖此榜单）。
            试试切换到「热销」榜或者换个区域。
          </p>
        </div>
      )}

      {/* Main table */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm min-w-[920px]">
          <thead className="bg-zinc-50/60 text-xs text-zinc-500">
            <tr>
              <th className="text-left font-medium px-4 py-3">#</th>
              <th className="text-left font-medium px-4 py-3">商品</th>
              <th className="text-right font-medium px-4 py-3">均价</th>
              <th className="text-right font-medium px-4 py-3">佣金</th>
              <th className="text-right font-medium px-4 py-3">总销量</th>
              <th className="text-right font-medium px-4 py-3">总 GMV</th>
              <th className="text-right font-medium px-4 py-3">达人</th>
              <th className="text-right font-medium px-4 py-3">视频</th>
              <th className="text-right font-medium px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {products.map((p, idx) => (
              <tr key={p.productId} className="hover:bg-zinc-50/50">
                <td className="px-4 py-3 text-zinc-400 tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleStar(p)}
                      disabled={starring.has(p.productId)}
                      className="flex h-5 w-5 items-center justify-center rounded text-zinc-300 hover:text-amber-400 transition-colors"
                      title={stars[p.productId] ? "取消收藏" : "收藏"}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          stars[p.productId] ? "fill-amber-400 text-amber-400" : ""
                        }`}
                      />
                    </button>
                    <span>{idx + 1}</span>
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[360px]">
                  <div className="flex items-start gap-2.5">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.coverUrl}
                        alt=""
                        className="h-10 w-10 flex-shrink-0 rounded-md object-cover bg-zinc-100"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="h-10 w-10 flex-shrink-0 rounded-md flex items-center justify-center text-sm font-semibold text-white shadow-sm"
                        style={{ background: stringToGradient(p.productName) }}
                      >
                        {p.productName
                          .replace(/\[.*?\]/g, "")
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                  <div className="font-medium truncate" title={p.productName}>
                    {p.productName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
                    <span>{p.region} · {p.productId.slice(0, 12)}</span>
                    {p.importedProductId && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 font-sans">
                        <Check className="h-2 w-2" />
                        已加入
                      </span>
                    )}
                    {p.analysis && (
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium font-sans ${
                          p.analysis.verdict === "RECOMMENDED"
                            ? "bg-emerald-50 text-emerald-700"
                            : p.analysis.verdict === "AVOID"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                        title={`分析于 ${new Date(p.analysis.createdAt).toLocaleString("zh-CN")}`}
                      >
                        <Sparkles className="h-2 w-2" />
                        {p.analysis.verdict === "RECOMMENDED"
                          ? "推荐"
                          : p.analysis.verdict === "AVOID"
                            ? "避开"
                            : "已分析"}
                      </span>
                    )}
                  </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  ${p.avgPrice.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                  {(p.commissionRate * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="inline-flex items-baseline gap-1.5">
                    <span>{fmt(p.totalSaleCnt)}</span>
                    {p.trend7dPct != null && p.trend7dPct !== 0 && (
                      <span
                        className={`text-[10px] font-medium ${
                          p.trend7dPct > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                        title="近 7 天变化"
                      >
                        {p.trend7dPct > 0 ? "↑" : "↓"}
                        {Math.abs(p.trend7dPct).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(p.totalSaleGmvAmt)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(p.totalIflCnt)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(p.totalVideoCnt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => analyzeProduct(p)}
                      disabled={analyzing.has(p.productId)}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      title="让分析师 Agent 基于真实数据做深度分析"
                    >
                      {analyzing.has(p.productId) ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-2.5 w-2.5" />
                      )}
                      AI 分析
                    </button>
                    {p.importedProductId ? (
                      <Link
                        href={`/app/assets/products`}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                        title="已在选品库中，点击查看"
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        已加入
                      </Link>
                    ) : (
                      <button
                        onClick={() => importProduct(p)}
                        disabled={importing.has(p.productId)}
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                        title="加入到我的选品库"
                      >
                        {importing.has(p.productId) ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Plus className="h-2.5 w-2.5" />
                        )}
                        加入
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-600 flex items-center justify-between flex-wrap gap-2">
        <span>
          💡 想看到趋势线 / Top 达人 / 关联视频？点行可展开详情（敬请期待）。
        </span>
        <Link
          href="/app/agents"
          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
        >
          查看分析师 Agent 历史 <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

