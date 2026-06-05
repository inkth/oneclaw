"use client";

import { Store, Star } from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { StateBadge, MockNotice, EmptyState, Thumb, type DiscoverState } from "../_components/shared";
import { fmt, fmtMoney } from "@/lib/echotik/format";

type Seller = {
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

const FIELDS = [
  { v: 1, cn: "销量" },
  { v: 2, cn: "GMV" },
];

export function SellersClient({
  region,
  rankType,
  field,
  categoryId,
  categories,
  state,
  fetchedAt,
  sellers,
}: {
  region: Region;
  rankType: number;
  field: number;
  categoryId: string | null;
  categories: CategoryOption[];
  state: DiscoverState;
  fetchedAt: string | null;
  sellers: Seller[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <Store className="h-5 w-5 text-indigo-500" />
          选品 · 店铺榜
          <StateBadge state={state} fetchedAt={fetchedAt} />
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          TikTok Shop 各国热销店铺榜单 · 按销量 / GMV 排序 · 看店铺规模、达人覆盖与内容矩阵
        </p>
      </div>

      {state === "mock" && <MockNotice />}

      <FilterBar
        basePath="/app/discover/sellers"
        region={region}
        rankType={rankType}
        field={field}
        categoryId={categoryId}
        categories={categories}
        fields={FIELDS}
      />

      {state === "empty" ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-zinc-50/60 text-xs text-zinc-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">#</th>
                <th className="text-left font-medium px-4 py-3">店铺</th>
                <th className="text-right font-medium px-4 py-3">评分</th>
                <th className="text-right font-medium px-4 py-3">商品数</th>
                <th className="text-right font-medium px-4 py-3">总销量</th>
                <th className="text-right font-medium px-4 py-3">总 GMV</th>
                <th className="text-right font-medium px-4 py-3">达人</th>
                <th className="text-right font-medium px-4 py-3">视频</th>
                <th className="text-right font-medium px-4 py-3">直播</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sellers.map((s, idx) => (
                <tr key={s.sellerId} className="hover:bg-zinc-50/50">
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">{idx + 1}</td>
                  <td className="px-4 py-3 max-w-[320px]">
                    <div className="flex items-center gap-2.5">
                      <Thumb src={s.coverUrl} name={s.sellerName} />
                      <div className="min-w-0">
                        <div className="font-medium truncate" title={s.sellerName}>
                          {s.sellerName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                          <span className="font-mono">{s.region}</span>
                          {s.categories.length > 0 && (
                            <span className="truncate">· {s.categories.join(" / ")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.rating > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-amber-600">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {s.rating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(s.totalProductCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt(s.totalSaleCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(s.totalSaleGmvAmt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(s.totalIflCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(s.totalVideoCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(s.totalLiveCnt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
