"use client";

import Link from "next/link";
import { Store, Star } from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { EmptyState, Thumb, type DiscoverState } from "../_components/shared";
import { Pagination } from "../_components/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { RankMedal } from "@/components/ui/RankMedal";
import { fmt, fmtMoney } from "../_components/format";
import { useWarmingRefresh } from "../_components/useWarmingRefresh";

export type Seller = {
  sellerId: string;
  sellerName: string;
  region: string;
  coverUrl: string | null;
  rating: number;
  categories: string[];
  // EchoTik 榜单接口此字段几乎恒为 0(非真实店铺商品总数),真实值仅 detail 接口有,故列表不展示。
  totalProductCnt: number;
  totalSaleCnt: number;
  totalSaleGmvAmt: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  totalLiveCnt: number;
};

export function SellersClient({
  region,
  rankType,
  field,
  categoryId,
  categories,
  keyword = "",
  state,
  warming,
  sellers,
  page,
  hasNext,
}: {
  region: Region;
  rankType: number;
  field: number;
  categoryId: string | null;
  categories: CategoryOption[];
  keyword?: string;
  state: DiscoverState;
  warming?: boolean;
  sellers: Seller[];
  page: number;
  hasNext: boolean;
}) {
  useWarmingRefresh(warming);
  const searching = keyword.trim().length > 0;
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Store className="h-5 w-5 text-brand-500" />
            店铺榜
          </span>
        }
        description="按销量和 GMV 找增长店铺，查看经营规模、达人覆盖和内容打法。"
      />

      <FilterBar
        basePath="/app/discover/sellers"
        region={region}
        rankType={rankType}
        field={field}
        categoryId={categoryId}
        categories={categories}
        keyword={keyword}
        searchPlaceholder="搜索店铺名"
      />

      {state === "empty" || sellers.length === 0 ? (
        <EmptyState
          hint={
            searching
              ? `没找到与「${keyword}」相关的店铺。换个关键词，或切换国家 / 地区再搜。`
              : undefined
          }
        />
      ) : (
        <TableWrap>
          <THead>
            <tr>
              <Th>#</Th>
              <Th>店铺</Th>
              <Th align="right">评分</Th>
              <Th align="right">总销量</Th>
              <Th align="right">总 GMV</Th>
              <Th align="right">达人</Th>
              <Th align="right">视频</Th>
              <Th align="right">直播</Th>
            </tr>
          </THead>
          <tbody>
            {sellers.map((s, idx) => (
              <Tr key={s.sellerId}>
                <Td><RankMedal rank={idx + 1} /></Td>
                <Td className="max-w-[320px]">
                  <Link
                    href={`/app/discover/sellers/${s.sellerId}?region=${s.region}`}
                    className="group flex items-center gap-2.5"
                  >
                    <Thumb src={s.coverUrl} name={s.sellerName} />
                    <div className="min-w-0">
                      <div
                        className="truncate font-medium text-zinc-900 group-hover:text-brand-600"
                        title={s.sellerName}
                      >
                        {s.sellerName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-2xs text-zinc-500">
                        <span className="font-mono">{s.region}</span>
                        {s.categories.length > 0 && (
                          <span className="truncate">· {s.categories.join(" / ")}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </Td>
                <Td align="right">
                  {s.rating > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-600">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {s.rating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </Td>
                <Td align="right" className="font-semibold text-zinc-900">{fmt(s.totalSaleCnt)}</Td>
                <Td align="right">{fmtMoney(s.totalSaleGmvAmt)}</Td>
                <Td align="right">{fmt(s.totalIflCnt)}</Td>
                <Td align="right">{fmt(s.totalVideoCnt)}</Td>
                <Td align="right">{fmt(s.totalLiveCnt)}</Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {!searching && <Pagination page={page} hasNext={hasNext} />}
    </div>
  );
}
