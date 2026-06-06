"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { LoginPromptModal } from "@/components/LoginPromptModal";
import {
  Sparkles,
  Plus,
  Loader2,
  Star,
  Check,
  CheckCircle2,
} from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { EmptyState, Thumb } from "../_components/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { fmt, fmtMoney } from "@/lib/echotik/format";

type RankType = 1 | 2 | 3;
type Field = 1 | 2 | 3;

type AnalysisInfo = {
  taskId: string;
  status: string;
  createdAt: string;
  verdict?: string;
};

type Interaction = { isStarred: boolean; tags: string[] };

/** 单个商品的个性化浮层（已导入 / 已分析 / 已收藏），流式补入。 */
export type DiscoverOverlayEntry = {
  importedProductId: string | null;
  analysis: AnalysisInfo | null;
  interaction: Interaction | null;
};
export type DiscoverOverlayMap = Record<string, DiscoverOverlayEntry>;

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
};

type DiscoverState = "live" | "cached" | "empty" | "mock" | "error";

export function DiscoverClient({
  workspaceId,
  region,
  rankType,
  field,
  categoryId,
  categories,
  state,
  products,
  overlay,
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
  /** 个性化浮层 Promise：服务端流式补入，首屏先渲染榜单，徽标随后到。 */
  overlay: Promise<DiscoverOverlayMap>;
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  // 浮层异步到达：不阻塞表格渲染，resolve 后徽标/收藏态自然补入。
  const [overlayMap, setOverlayMap] = useState<DiscoverOverlayMap | null>(null);
  useEffect(() => {
    let alive = true;
    overlay.then((m) => alive && setOverlayMap(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [overlay]);

  // 游客触发绑账号的动作（导入/分析/收藏）时拦下来提示登录。返回 true 表示已拦截。
  function gateGuest(): boolean {
    if (!isGuest) return false;
    setLoginPromptOpen(true);
    return true;
  }

  async function importProduct(p: DiscoverProduct) {
    if (importing.has(p.productId)) return;
    if (gateGuest()) return;
    setImporting((prev) => new Set(prev).add(p.productId));
    const res = await fetch(
      `/api/workspaces/${workspaceId}/discover/import-product`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: p.productId,
          region: p.region,
          categoryLabel: "TikTok 爆品",
        }),
      },
    );
    const json = await res.json();
    setImporting((prev) => {
      const n = new Set(prev);
      n.delete(p.productId);
      return n;
    });
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || "加入失败");
      return;
    }
    if (json.data.alreadyExists) {
      toast(`选品库里已经有了：${p.productName.slice(0, 30)}…`);
    } else {
      toast.success(`已加入选品库：${p.productName.slice(0, 30)}…`);
    }
    router.refresh();
  }

  const [starring, setStarring] = useState<Set<string>>(new Set());
  // 用户本地操作覆盖在浮层收藏态之上：有 override 用 override，否则取流式到达的浮层值。
  const [starOverrides, setStarOverrides] = useState<Record<string, boolean>>({});
  const isStarred = (id: string) =>
    starOverrides[id] ?? overlayMap?.[id]?.interaction?.isStarred ?? false;

  async function toggleStar(p: DiscoverProduct) {
    if (starring.has(p.productId)) return;
    if (gateGuest()) return;
    const next = !isStarred(p.productId);
    setStarring((prev) => new Set(prev).add(p.productId));
    setStarOverrides((prev) => ({ ...prev, [p.productId]: next }));
    const res = await fetch(`/api/workspaces/${workspaceId}/discover/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: p.productId, region: p.region, isStarred: next }),
    });
    setStarring((prev) => {
      const n = new Set(prev);
      n.delete(p.productId);
      return n;
    });
    if (!res.ok) {
      setStarOverrides((prev) => ({ ...prev, [p.productId]: !next }));
      toast.error("收藏失败");
    } else if (next) {
      toast.success("已收藏");
    }
  }

  async function analyzeProduct(p: DiscoverProduct) {
    if (analyzing.has(p.productId)) return;
    if (gateGuest()) return;
    setAnalyzing((prev) => new Set(prev).add(p.productId));
    const res = await fetch(`/api/workspaces/${workspaceId}/discover/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.productId, region: p.region }),
    });
    const json = await res.json();
    setAnalyzing((prev) => {
      const n = new Set(prev);
      n.delete(p.productId);
      return n;
    });
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || "分析失败");
      return;
    }
    toast.success("已派给分析师，10-20s 后到工作台查看", {
      action: {
        label: "去看",
        onClick: () => router.push("/app"),
      },
    });
  }

  return (
    <div className="space-y-6">
      {loginPromptOpen && (
        <LoginPromptModal
          onClose={() => setLoginPromptOpen(false)}
          callbackUrl="/app/discover/products"
          title="登录后即可操作"
          desc="导入选品、AI 分析、收藏都需要账号。趋势榜随便逛，登录后即可一键操作。"
        />
      )}

      <PageHeader
        title="发现 · TikTok 爆品"
        description="TikTok Shop 真实销售数据 · 点商品行查看趋势 · 一键派给分析师做深度判断"
      />


      <FilterBar
        basePath="/app/discover/products"
        region={region}
        rankType={rankType}
        field={field}
        categoryId={categoryId}
        categories={categories}
      />

      {state === "empty" && (
        <EmptyState hint="这个区域 / 榜单组合下还没有可用数据（可能 T-1 数据未生成，或当前账号订阅未覆盖此榜单）。试试换个区域。" />
      )}

      {/* Main table */}
      <TableWrap>
        <THead>
          <tr>
            <Th>#</Th>
            <Th>商品</Th>
            <Th align="right">均价</Th>
            <Th align="right">佣金</Th>
            <Th align="right">总销量</Th>
            <Th align="right">总 GMV</Th>
            <Th align="right">达人</Th>
            <Th align="right">视频</Th>
            <Th align="right">操作</Th>
          </tr>
        </THead>
        <tbody>
          {products.map((p, idx) => {
            const ov = overlayMap?.[p.productId];
            const importedProductId = ov?.importedProductId ?? null;
            const analysis = ov?.analysis ?? null;
            const starred = isStarred(p.productId);
            return (
            <Tr key={p.productId}>
              <Td className="text-zinc-400 tabular-nums">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleStar(p)}
                    disabled={starring.has(p.productId)}
                    className="flex h-5 w-5 items-center justify-center rounded text-zinc-300 transition-colors hover:text-amber-400"
                    title={starred ? "取消收藏" : "收藏"}
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        starred ? "fill-amber-400 text-amber-400" : ""
                      }`}
                    />
                  </button>
                  <span>{idx + 1}</span>
                </div>
              </Td>
              <Td className="max-w-[360px]">
                <div className="flex items-start gap-2.5">
                  <Thumb src={p.coverUrl} name={p.productName} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900" title={p.productName}>
                      {p.productName}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-2xs text-zinc-500">
                      <span>{p.region} · {p.productId.slice(0, 12)}</span>
                      {importedProductId && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 font-sans text-2xs font-medium text-emerald-700">
                          <Check className="h-2 w-2" />
                          已加入
                        </span>
                      )}
                      {analysis && (
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-sans text-2xs font-medium ${
                            analysis.verdict === "RECOMMENDED"
                              ? "bg-emerald-50 text-emerald-700"
                              : analysis.verdict === "AVOID"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                          title={`分析于 ${new Date(analysis.createdAt).toLocaleString("zh-CN")}`}
                        >
                          <Sparkles className="h-2 w-2" />
                          {analysis.verdict === "RECOMMENDED"
                            ? "推荐"
                            : analysis.verdict === "AVOID"
                              ? "避开"
                              : "已分析"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Td>
              <Td align="right" className="font-semibold text-zinc-900">
                ${p.avgPrice.toFixed(2)}
              </Td>
              <Td align="right" className="text-emerald-700">
                {(p.commissionRate * 100).toFixed(0)}%
              </Td>
              <Td align="right">
                <div className="inline-flex items-baseline gap-1.5">
                  <span>{fmt(p.totalSaleCnt)}</span>
                  {p.trend7dPct != null && p.trend7dPct !== 0 && (
                    <span
                      className={`text-2xs font-medium ${
                        p.trend7dPct > 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                      title="近 7 天变化"
                    >
                      {p.trend7dPct > 0 ? "↑" : "↓"}
                      {Math.abs(p.trend7dPct).toFixed(1)}%
                    </span>
                  )}
                </div>
              </Td>
              <Td align="right">{fmtMoney(p.totalSaleGmvAmt)}</Td>
              <Td align="right">{fmt(p.totalIflCnt)}</Td>
              <Td align="right">{fmt(p.totalVideoCnt)}</Td>
              <Td>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => analyzeProduct(p)}
                    disabled={analyzing.has(p.productId)}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                    title="让分析师 Agent 基于真实数据做深度分析"
                  >
                    {analyzing.has(p.productId) ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-2.5 w-2.5" />
                    )}
                    AI 分析
                  </button>
                  {importedProductId ? (
                    <Link
                      href={`/app/assets/products`}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-2xs font-medium text-emerald-700 hover:bg-emerald-100"
                      title="已在选品库中，点击查看"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      已加入
                    </Link>
                  ) : (
                    <button
                      onClick={() => importProduct(p)}
                      disabled={importing.has(p.productId)}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-2xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
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
              </Td>
            </Tr>
            );
          })}
        </tbody>
      </TableWrap>
    </div>
  );
}

