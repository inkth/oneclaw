"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { FilterBar, type CategoryOption, type FieldOption } from "../_components/FilterBar";
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
  keyword = "",
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
  state: DiscoverState;
  fetchedAt: string | null;
  products: DiscoverProduct[];
  page: number;
  hasNext: boolean;
  isGuest?: boolean;
}) {
  const searching = keyword.trim().length > 0;
  const router = useRouter();
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const { open: openAuthModal } = useAuthModal();

  // 游客触发「导入/收藏」时拦下来弹登录浮层。返回 true 表示已拦截。
  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可操作",
      desc: "收藏商品需要账号。趋势榜随便逛,登录后一键收藏。",
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
      toast.error(e instanceof Error ? e.message : "加入失败");
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
        keyword={keyword}
        searchPlaceholder="搜索商品名 / 关键词…"
      />

      {/* Main table — 无数据时不渲染裸表头,改用统一空态 */}
      {products.length === 0 ? (
        searching ? (
          <EmptyState
            icon={PackageSearch}
            title={`没找到与「${keyword}」相关的商品`}
            description="换个关键词,或切换国家 / 地区再搜。也可以清空搜索回到爆品榜。"
          />
        ) : (
          <EmptyState
            icon={PackageSearch}
            title="该榜单暂无数据"
            description="这个区域 / 榜单组合下还没有可用数据。试试切换到「热销」榜,或者换个国家 / 地区再看看。"
          />
        )
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
                  <RankMedal rank={idx + 1} />
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
                        className="rounded-full px-2.5 bg-emerald-50 text-emerald-700 ring-0 hover:bg-emerald-100"
                        title="已收藏,点击去收藏页查看"
                      >
                        <BookmarkCheck className="h-3 w-3" />
                        已收藏
                      </ButtonLink>
                    ) : (
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => importProduct(p)}
                        disabled={importing.has(p.productId)}
                        className="rounded-full px-2.5"
                        title="收藏到我的收藏夹"
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
      )}

      {!searching && <Pagination page={page} hasNext={hasNext} />}
    </div>
  );
}
