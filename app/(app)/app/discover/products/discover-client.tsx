"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import {
  Sparkles,
  Plus,
  Loader2,
  Flame,
  TrendingUp,
  Star,
  Globe,
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

const REGIONS: Array<{ code: Region; cn: string; flag: string }> = [
  { code: "US", cn: "美国", flag: "🇺🇸" },
  { code: "GB", cn: "英国", flag: "🇬🇧" },
  { code: "ID", cn: "印尼", flag: "🇮🇩" },
  { code: "TH", cn: "泰国", flag: "🇹🇭" },
  { code: "VN", cn: "越南", flag: "🇻🇳" },
  { code: "MY", cn: "马来", flag: "🇲🇾" },
];

const RANK_TYPES: Array<{ v: RankType; cn: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = [
  { v: 1, cn: "热销", icon: Flame, tone: "from-orange-500 to-rose-500" },
  { v: 2, cn: "上升", icon: TrendingUp, tone: "from-indigo-500 to-violet-500" },
  { v: 3, cn: "新品", icon: Star, tone: "from-emerald-500 to-teal-500" },
];

const FIELDS: Array<{ v: Field; cn: string }> = [
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
  state,
  fetchedAt,
  products,
}: {
  workspaceId: string;
  region: Region;
  rankType: RankType;
  field: Field;
  state: DiscoverState;
  fetchedAt: string | null;
  products: DiscoverProduct[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());

  function navigate(patch: { region?: Region; rank_type?: RankType; field?: Field }) {
    const p = new URLSearchParams({
      region: patch.region ?? region,
      rank_type: String(patch.rank_type ?? rankType),
      field: String(patch.field ?? field),
    });
    startTransition(() => router.push(`/app/discover/products?${p.toString()}`));
  }

  async function importProduct(p: DiscoverProduct) {
    if (importing.has(p.productId)) return;
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

  // Phase 1:AI 选品分析(ANALYST agent)迁移中,先占位。
  async function analyzeProduct(_p: DiscoverProduct) {
    toast.message("AI 选品分析迁移中", { description: "Agent 工作流将在后续阶段上线" });
  }

  const top = useMemo(() => products.slice(0, 3), [products]);

  return (
    <div className="space-y-6">
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

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-wrap items-center gap-3">
        <FilterGroup label={<><Globe className="h-3 w-3" />区域</>}>
          {REGIONS.map((r) => (
            <button
              key={r.code}
              onClick={() => navigate({ region: r.code })}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                region === r.code
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <span>{r.flag}</span>
              {r.cn}
            </button>
          ))}
        </FilterGroup>

        <FilterGroup label="榜单">
          {RANK_TYPES.map((rt) => {
            const Icon = rt.icon;
            const active = rankType === rt.v;
            return (
              <button
                key={rt.v}
                onClick={() => navigate({ rank_type: rt.v })}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  active
                    ? `bg-gradient-to-br ${rt.tone} text-white`
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <Icon className="h-3 w-3" />
                {rt.cn}
              </button>
            );
          })}
        </FilterGroup>

        <FilterGroup label="按">
          {FIELDS.map((f) => {
            const active = field === f.v;
            return (
              <button
                key={f.v}
                onClick={() => navigate({ field: f.v })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {f.cn}
              </button>
            );
          })}
        </FilterGroup>
      </div>

      {state === "empty" && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <div className="text-base font-semibold">该榜单暂无数据</div>
          <p className="mt-1.5 text-sm text-zinc-500 max-w-md mx-auto">
            EchoTik 这个区域 / 榜单组合下还没有可用数据（可能 T-1 数据未生成，或当前账号订阅未覆盖此榜单）。
            试试切换到「热销」榜或者换个区域。
          </p>
        </div>
      )}

      {/* Top 3 highlight cards */}
      {top.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top.map((p, idx) => (
            <HighlightCard
              key={p.productId}
              rank={idx + 1}
              product={p}
              busyImport={importing.has(p.productId)}
              busyAnalyze={analyzing.has(p.productId)}
              onImport={() => importProduct(p)}
              onAnalyze={() => analyzeProduct(p)}
            />
          ))}
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

function FilterGroup({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function HighlightCard({
  rank,
  product: p,
  busyImport,
  busyAnalyze,
  onImport,
  onAnalyze,
}: {
  rank: number;
  product: DiscoverProduct;
  busyImport: boolean;
  busyAnalyze: boolean;
  onImport: () => void;
  onAnalyze: () => void;
}) {
  const trophy = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  return (
    <div className="relative rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-4 flex flex-col">
      <div className="absolute -top-2 -left-2 flex h-7 w-7 items-center justify-center rounded-full bg-white border border-zinc-200 text-base shadow-sm">
        {trophy}
      </div>
      <div className="mt-1 text-sm font-semibold leading-snug line-clamp-2 min-h-[2.6em]" title={p.productName}>
        {p.productName}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="均价" value={`$${p.avgPrice.toFixed(0)}`} />
        <Stat label="销量" value={fmt(p.totalSaleCnt)} />
        <Stat label="GMV" value={fmtMoney(p.totalSaleGmvAmt)} />
      </div>
      <div className="mt-3 text-[11px] text-zinc-500">
        {fmt(p.totalIflCnt)} 个达人在带 · {fmt(p.totalVideoCnt)} 条挂车视频 · 佣金 {(p.commissionRate * 100).toFixed(0)}%
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <button
          onClick={onAnalyze}
          disabled={busyAnalyze}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-indigo-50 px-2 py-1.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
        >
          {busyAnalyze ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
          AI 分析
        </button>
        <button
          onClick={onImport}
          disabled={busyImport}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {busyImport ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
          加入选品
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white border border-zinc-200 px-2 py-1.5">
      <div className="text-[9px] text-zinc-400 uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-xs font-bold tabular-nums">{value}</div>
    </div>
  );
}
