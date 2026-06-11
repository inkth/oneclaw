"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { FilterBar, type CategoryOption, type FieldOption } from "../_components/FilterBar";
import { type Region } from "../_components/regions";
import { Thumb } from "../_components/shared";
import { fmt, fmtMoney } from "../_components/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RankMedal } from "@/components/ui/RankMedal";
import { Delta } from "@/components/ui/Delta";
import { VERDICT_TONE, VERDICT_LABEL } from "@/lib/ui/tokens";
import {
  Compass,
  Sparkles,
  Plus,
  Loader2,
  Star,
  ArrowUpRight,
  CheckCircle2,
  PackageSearch,
} from "lucide-react";

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

type DiscoverState = "live" | "cached" | "empty" | "mock" | "error";

export function DiscoverClient({
  workspaceId,
  region,
  rankType,
  field,
  categoryId,
  categories,
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
  const { open: openAuthModal } = useAuthModal();

  // 游客触发「导入/收藏/分析」时拦下来弹登录浮层。返回 true 表示已拦截。
  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可操作",
      desc: "导入选品、收藏、AI 分析都需要账号。趋势榜随便逛,登录后一键操作。",
    });
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
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Compass className="h-5 w-5 text-brand-500" />
            发现 · TikTok 爆品
          </span>
        }
        description="TikTok Shop 真实销售数据 · 点商品行查看趋势 · 一键派给分析师做深度判断"
      />

      <FilterBar
        basePath="/app/discover/products"
        region={region}
        rankType={rankType}
        field={field}
        fields={PRODUCT_FIELDS}
        categoryId={categoryId}
        categories={categories}
      />

      {/* Main table — 无数据时不渲染裸表头,改用统一空态 */}
      {products.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="该榜单暂无数据"
          description="这个区域 / 榜单组合下还没有可用数据。试试切换到「热销」榜,或者换个国家 / 地区再看看。"
        />
      ) : (
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
            {products.map((p, idx) => (
              <Tr key={p.productId}>
                <Td>
                  <div className="flex items-center gap-2">
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
                    <RankMedal rank={idx + 1} />
                  </div>
                </Td>
                <Td className="max-w-[360px]">
                  <Link
                    href={`/app/discover/products/${p.productId}?region=${p.region}`}
                    className="flex items-start gap-2.5 group"
                  >
                    <Thumb src={p.coverUrl} name={p.productName} className="h-10 w-10 rounded-md" />
                    <div className="min-w-0">
                      <div
                        className="font-medium truncate group-hover:text-brand-700 transition-colors"
                        title={p.productName}
                      >
                        {p.productName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-zinc-500 font-mono">
                        <span>
                          {p.region} · {p.productId.slice(0, 12)}
                        </span>
                        {p.importedProductId && (
                          <Badge tone="success" outline={false} className="font-sans">
                            已加入
                          </Badge>
                        )}
                        {p.analysis && (
                          <Badge
                            tone={VERDICT_TONE[p.analysis.verdict ?? ""] ?? "warning"}
                            outline={false}
                            icon={<Sparkles className="h-2.5 w-2.5" />}
                            title={`分析于 ${new Date(p.analysis.createdAt).toLocaleString("zh-CN")}`}
                            className="font-sans"
                          >
                            {VERDICT_LABEL[p.analysis.verdict ?? ""] ?? "已分析"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                </Td>
                <Td align="right" className="font-semibold">
                  ${p.avgPrice.toFixed(2)}
                </Td>
                <Td align="right" className="text-emerald-700">
                  {(p.commissionRate * 100).toFixed(0)}%
                </Td>
                <Td align="right">
                  <div className="inline-flex items-baseline gap-1.5">
                    <span>{fmt(p.totalSaleCnt)}</span>
                    <Delta value={p.trend7dPct} />
                  </div>
                </Td>
                <Td align="right">{fmtMoney(p.totalSaleGmvAmt)}</Td>
                <Td align="right">{fmt(p.totalIflCnt)}</Td>
                <Td align="right">{fmt(p.totalVideoCnt)}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => analyzeProduct(p)}
                      disabled={analyzing.has(p.productId)}
                      className="rounded-full px-2.5"
                      title="让分析师 Agent 基于真实数据做深度分析"
                    >
                      {analyzing.has(p.productId) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      AI 分析
                    </Button>
                    {p.importedProductId ? (
                      <ButtonLink
                        href="/app/assets/products"
                        size="sm"
                        className="rounded-full px-2.5 bg-emerald-50 text-emerald-700 ring-0 hover:bg-emerald-100"
                        title="已在选品库中,点击查看"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        已加入
                      </ButtonLink>
                    ) : (
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => importProduct(p)}
                        disabled={importing.has(p.productId)}
                        className="rounded-full px-2.5"
                        title="加入到我的选品库"
                      >
                        {importing.has(p.productId) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        加入
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-600 flex items-center justify-between flex-wrap gap-2">
        <span>💡 点商品查看详情：销量趋势、Top 带货达人、关联视频与选品诊断评分。</span>
        <Link
          href="/app/agents"
          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
        >
          查看分析师 Agent 历史 <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
