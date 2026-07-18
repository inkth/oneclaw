"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { FilterBar, type CategoryOption, type FieldOption } from "../_components/FilterBar";
import { SegmentedTabs } from "@/components/ui/Tabs";
import { type Region } from "../_components/regions";
import { Pagination } from "../_components/Pagination";
import { Thumb } from "../_components/shared";
import { fmt, fmtMoney } from "../_components/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RankMedal } from "@/components/ui/RankMedal";
import { Delta } from "@/components/ui/Delta";
import { Sparkline } from "@/components/ui/Sparkline";
import { useWarmingRefresh } from "../_components/useWarmingRefresh";
import { VERDICT_TONE, VERDICT_LABEL } from "@/lib/ui/tokens";
import {
  Compass,
  Sparkles,
  Loader2,
  Bookmark,
  BookmarkCheck,
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

type DiscoverProduct = {
  productId: string;
  productName: string;
  productNameZh: string;
  region: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  commissionRate: number;
  totalSaleCnt: number;
  totalSaleGmvAmt: number;
  sale7dCnt: number;
  gmv7dAmt: number;
  spark7d: number[];
  totalIflCnt: number;
  totalVideoCnt: number;
  totalLiveCnt: number;
  coverUrl: string | null;
  trend7dPct: number | null;
  importedProductId: string | null;
  analysis: AnalysisInfo | null;
};

// 商品榜排序支持 3 项（店铺/达人/视频只有销量/GMV）。
const PRODUCT_FIELDS: FieldOption[] = [
  { v: 1, cn: "销量" },
  { v: 2, cn: "GMV" },
  { v: 3, cn: "增长" },
];

type DiscoverState = "live" | "cached" | "empty" | "error";

// 榜单视图:rank=EchoTik 热销总榜(默认);hot7d/accel=爆品雷达(本地动量榜,单页 Top20)。
type BoardView = "rank" | "hot7d" | "accel";

const BOARD_VIEWS: { label: string; value: BoardView }[] = [
  { label: "热销总榜", value: "rank" },
  { label: "7天爆量", value: "hot7d" },
  { label: "上升黑马", value: "accel" },
];

const BOARD_HINTS: Record<BoardView, string | null> = {
  rank: null,
  hot7d: "按近 7 天销量排序——最近一周正在出单的商品，比累计榜更接近当下。",
  accel: "按「近 7 天销量 ÷ 累计销量」排序——累计不高但一周猛涨的冷启动黑马。",
};

export function DiscoverClient({
  workspaceId,
  region,
  rankType,
  field,
  categoryId,
  categories,
  keyword = "",
  view = null,
  warming,
  products,
  page,
  hasNext,
  isGuest = false,
}: {
  workspaceId: string;
  region: Region;
  rankType: RankType;
  field: Field;
  categoryId: string | null;
  categories: CategoryOption[];
  keyword?: string;
  view?: "hot7d" | "accel" | null;
  state: DiscoverState;
  fetchedAt: string | null;
  warming?: boolean;
  products: DiscoverProduct[];
  page: number;
  hasNext: boolean;
  isGuest?: boolean;
}) {
  const searching = keyword.trim().length > 0;
  const boardView: BoardView = view ?? "rank";
  const router = useRouter();
  useWarmingRefresh(warming);

  // 切换榜单视图:保留地区/类目,清掉分页(雷达单页);rank 视图不带 view 参数。
  function switchView(next: BoardView) {
    if (next === boardView) return;
    const p = new URLSearchParams();
    p.set("region", region);
    if (categoryId) p.set("category_id", categoryId);
    if (next !== "rank") p.set("view", next);
    router.push(`/app/discover/products?${p.toString()}`);
  }
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const { open: openAuthModal } = useAuthModal();

  // 游客触发「导入/收藏」时拦下来弹登录浮层。返回 true 表示已拦截。
  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可操作",
      desc: "收藏商品需要账号。榜单随便逛，登录后一键收藏。",
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
        toast(`已经收藏过了：${p.productName.slice(0, 30)}…`);
      } else {
        toast.success(`已收藏：${p.productName.slice(0, 30)}…`);
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "收藏失败");
    } finally {
      setImporting((prev) => {
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
            爆品榜
          </span>
        }
        description="用真实销量、GMV 和佣金筛机会；打开商品看趋势，收藏后继续算利润、做内容。"
      />

      <FilterBar
        basePath="/app/discover/products"
        region={region}
        rankType={rankType}
        field={field}
        fields={PRODUCT_FIELDS}
        categoryId={categoryId}
        categories={categories}
        keyword={keyword}
        searchPlaceholder="搜索商品或关键词"
      />

      {/* 榜单视图切换:热销总榜(EchoTik 存量口径) vs 爆品雷达(本地动量口径)。搜索态隐藏。 */}
      {!searching && (
        <div className="space-y-1.5">
          <SegmentedTabs
            items={BOARD_VIEWS}
            value={boardView}
            onValueChange={switchView}
            ariaLabel="榜单视图"
          />
          {BOARD_HINTS[boardView] && (
            <p className="text-2xs text-zinc-400">{BOARD_HINTS[boardView]}</p>
          )}
        </div>
      )}

      {/* Main table — 无数据时不渲染裸表头，改用统一空态 */}
      {products.length === 0 ? (
        searching ? (
          <EmptyState
            icon={PackageSearch}
            title={`没找到与「${keyword}」相关的商品`}
            description="换个关键词或地区再试，也可以清空搜索回到爆品榜。"
          />
        ) : boardView !== "rank" ? (
          <EmptyState
            icon={PackageSearch}
            title="雷达暂无数据"
            description="近 7 天动量数据随榜单同步逐步回填，稍后再来，或换个地区/类目看看。"
          />
        ) : (
          <EmptyState
            icon={PackageSearch}
            title="该榜单暂无数据"
            description="这个地区或榜单暂时没有数据，换个地区或排序方式看看。"
          />
        )
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {products.map((p, idx) => (
              <article key={p.productId} className="rounded-2xl border border-black/[0.065] bg-white p-4 shadow-[0_1px_2px_rgba(18,20,25,.025)]">
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <Thumb src={p.coverUrl} name={p.productNameZh || p.productName} className="h-16 w-16 rounded-xl" />
                    <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-ink px-1 text-[9px] font-bold text-white nums">
                      {idx + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/app/discover/products/${p.productId}?region=${p.region}`}
                      className="line-clamp-2 text-sm font-semibold leading-5 text-ink"
                    >
                      {p.productNameZh || p.productName}
                    </Link>
                    {p.productNameZh && p.productNameZh !== p.productName && (
                      <p className="mt-0.5 truncate text-2xs text-zinc-400">{p.productName}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {p.importedProductId && <Badge tone="success" outline={false}>已收藏</Badge>}
                      {p.analysis && (
                        <Badge
                          tone={VERDICT_TONE[p.analysis.verdict ?? ""] ?? "warning"}
                          outline={false}
                          icon={<Sparkles className="h-2.5 w-2.5" />}
                        >
                          {VERDICT_LABEL[p.analysis.verdict ?? ""] ?? "已分析"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 divide-x divide-black/[0.055] rounded-xl bg-[var(--dk-surface-2)] px-1 py-2.5 text-center">
                  <div>
                    <div className="text-2xs text-zinc-400">均价</div>
                    <div className="mt-0.5 text-xs font-semibold nums">${p.avgPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-2xs text-zinc-400">佣金</div>
                    <div className="mt-0.5 text-xs font-semibold text-emerald-700 nums">{(p.commissionRate * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-2xs text-zinc-400">销量</div>
                    <div className="mt-0.5 text-xs font-semibold nums">{fmt(p.totalSaleCnt)}</div>
                  </div>
                  <div>
                    <div className="text-2xs text-zinc-400">GMV</div>
                    <div className="mt-0.5 text-xs font-semibold nums">{fmtMoney(p.totalSaleGmvAmt)}</div>
                  </div>
                </div>

                {/* 近 7 天窗口:有数据才显示(旧库存量商品可能还没回填,不给一排「—」占版面) */}
                {(p.sale7dCnt > 0 || p.spark7d.length > 1) && (
                  <div className="mt-2 flex items-center gap-3 rounded-xl bg-[var(--dk-surface-2)] px-3 py-2">
                    <span className="shrink-0 text-2xs text-zinc-400">近7天</span>
                    {p.spark7d.length > 1 && <Sparkline data={p.spark7d} width={72} height={18} />}
                    <div className="ml-auto flex items-baseline gap-3">
                      {p.sale7dCnt > 0 && <span className="text-xs font-semibold nums">{fmt(p.sale7dCnt)} 件</span>}
                      {p.gmv7dAmt > 0 && <span className="text-xs font-semibold nums">{fmtMoney(p.gmv7dAmt)}</span>}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <Link
                    href={`/app/discover/products/${p.productId}?region=${p.region}`}
                    className="text-xs font-semibold text-brand-700"
                  >
                    查看机会详情
                  </Link>
                  {p.importedProductId ? (
                    <ButtonLink href="/app/discover/favorites" size="sm" className="h-8 rounded-full bg-emerald-50 px-3 text-emerald-700 ring-0 hover:bg-emerald-100">
                      <BookmarkCheck className="h-3 w-3" /> 已收藏
                    </ButtonLink>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => importProduct(p)}
                      disabled={importing.has(p.productId)}
                      className="h-8 px-3"
                    >
                      {importing.has(p.productId) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
                      收藏
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <TableWrap className="hidden md:block" minWidth={1160}>
          <THead>
            <tr>
              <Th>#</Th>
              <Th>商品</Th>
              <Th align="right">均价</Th>
              <Th align="right">佣金</Th>
              <Th>近7天趋势</Th>
              <Th align="right">近7天销量</Th>
              <Th align="right">近7天 GMV</Th>
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
                  <RankMedal rank={idx + 1} />
                </Td>
                <Td className="max-w-[360px]">
                  <Link
                    href={`/app/discover/products/${p.productId}?region=${p.region}`}
                    className="flex items-start gap-2.5 group"
                  >
                    <Thumb src={p.coverUrl} name={p.productNameZh || p.productName} className="h-10 w-10 rounded-md" />
                    <div className="min-w-0">
                      <div
                        className="font-medium truncate group-hover:text-brand-700 transition-colors"
                        title={p.productNameZh || p.productName}
                      >
                        {p.productNameZh || p.productName}
                      </div>
                      {p.productNameZh && p.productNameZh !== p.productName && (
                        <div className="truncate text-2xs text-zinc-400" title={p.productName}>
                          {p.productName}
                        </div>
                      )}
                      <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-zinc-500 font-mono">
                        <span>
                          {p.region} · {p.productId.slice(0, 12)}
                        </span>
                        {p.importedProductId && (
                          <Badge tone="success" outline={false} className="font-sans">
                            已收藏
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
                <Td>
                  {p.spark7d.length > 1 ? (
                    <Sparkline data={p.spark7d} />
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </Td>
                <Td align="right" className="font-semibold">
                  {p.sale7dCnt > 0 ? fmt(p.sale7dCnt) : <span className="font-normal text-zinc-300">—</span>}
                </Td>
                <Td align="right">
                  {p.gmv7dAmt > 0 ? fmtMoney(p.gmv7dAmt) : <span className="text-zinc-300">—</span>}
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
                    {p.importedProductId ? (
                      <ButtonLink
                        href="/app/discover/favorites"
                        size="sm"
                        className="rounded-lg px-2.5 bg-emerald-50 text-emerald-700 ring-0 hover:bg-emerald-100"
                        title="已收藏，点击去收藏页查看"
                      >
                        <BookmarkCheck className="h-3 w-3" />
                        已收藏
                      </ButtonLink>
                    ) : (
                      // 行内动作用次级按钮：一屏 20 行，每行一个品牌色实底会让电紫从
                      // 「强调」退化成「底噪」。品牌色只留给页面级的成交动作。
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => importProduct(p)}
                        disabled={importing.has(p.productId)}
                        className="rounded-lg px-2.5"
                        title="收藏商品"
                      >
                        {importing.has(p.productId) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Bookmark className="h-3 w-3" />
                        )}
                        收藏
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
          </TableWrap>
        </>
      )}

      {!searching && boardView === "rank" && <Pagination page={page} hasNext={hasNext} />}
    </div>
  );
}
