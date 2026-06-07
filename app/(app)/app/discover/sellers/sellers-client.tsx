"use client";

import { Store, Star } from "lucide-react";
import { FilterBar, type Region } from "../_components/FilterBar";
import { EmptyState, StateBadge, Thumb, type DiscoverState } from "../_components/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { fmt, fmtMoney } from "../_components/format";

export type Seller = {
  sellerId: string;
  sellerName: string;
  region: string;
  coverUrl: string | null;
  rating: number;
  categories: string[];
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
  state,
  sellers,
}: {
  region: Region;
  rankType: number;
  field: number;
  state: DiscoverState;
  sellers: Seller[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Store className="h-5 w-5 text-brand-500" />
            选品 · 店铺榜
            <StateBadge state={state} />
          </span>
        }
        description="TikTok Shop 各国热销店铺榜单 · 按销量 / GMV 排序 · 看店铺规模、达人覆盖与内容矩阵"
      />

      <FilterBar basePath="/app/discover/sellers" region={region} rankType={rankType} field={field} />

      {state === "empty" || sellers.length === 0 ? (
        <EmptyState />
      ) : (
        <TableWrap>
          <THead>
            <tr>
              <Th>#</Th>
              <Th>店铺</Th>
              <Th align="right">评分</Th>
              <Th align="right">商品数</Th>
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
                <Td className="text-zinc-400 tabular-nums">{idx + 1}</Td>
                <Td className="max-w-[320px]">
                  <div className="flex items-center gap-2.5">
                    <Thumb src={s.coverUrl} name={s.sellerName} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-900" title={s.sellerName}>
                        {s.sellerName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-2xs text-zinc-500">
                        <span className="font-mono">{s.region}</span>
                        {s.categories.length > 0 && (
                          <span className="truncate">· {s.categories.join(" / ")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td align="right">
                  {s.rating > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-600">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {s.rating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </Td>
                <Td align="right">{fmt(s.totalProductCnt)}</Td>
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
    </div>
  );
}
