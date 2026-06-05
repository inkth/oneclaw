"use client";

import { Users, Award } from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { StateBadge, MockNotice, EmptyState, Thumb, type DiscoverState } from "../_components/shared";
import { fmt, fmtMoney } from "@/lib/echotik/format";

type Influencer = {
  userId: string;
  uniqueId: string;
  nickName: string;
  region: string;
  avatarUrl: string | null;
  category: string;
  ecScore: number;
  totalFollowersCnt: number;
  totalDiggCnt: number;
  totalProductCnt: number;
  totalPostVideoCnt: number;
  totalLiveCnt: number;
  totalSaleCnt: number;
  totalSaleGmvAmt: number;
};

const FIELDS = [
  { v: 1, cn: "带货销量" },
  { v: 2, cn: "带货 GMV" },
];

export function InfluencersClient({
  region,
  rankType,
  field,
  categoryId,
  categories,
  state,
  fetchedAt,
  influencers,
}: {
  region: Region;
  rankType: number;
  field: number;
  categoryId: string | null;
  categories: CategoryOption[];
  state: DiscoverState;
  fetchedAt: string | null;
  influencers: Influencer[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-500" />
          选品 · 达人榜
          <StateBadge state={state} fetchedAt={fetchedAt} />
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          各国带货达人榜单 · 看粉丝量、带货 GMV、商品与内容产出 · 找对的人合作
        </p>
      </div>

      {state === "mock" && <MockNotice />}

      <FilterBar
        basePath="/app/discover/influencers"
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
          <table className="w-full text-sm min-w-[940px]">
            <thead className="bg-zinc-50/60 text-xs text-zinc-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">#</th>
                <th className="text-left font-medium px-4 py-3">达人</th>
                <th className="text-right font-medium px-4 py-3">带货分</th>
                <th className="text-right font-medium px-4 py-3">粉丝</th>
                <th className="text-right font-medium px-4 py-3">带货销量</th>
                <th className="text-right font-medium px-4 py-3">带货 GMV</th>
                <th className="text-right font-medium px-4 py-3">商品</th>
                <th className="text-right font-medium px-4 py-3">视频</th>
                <th className="text-right font-medium px-4 py-3">直播</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {influencers.map((i, idx) => (
                <tr key={i.userId} className="hover:bg-zinc-50/50">
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">{idx + 1}</td>
                  <td className="px-4 py-3 max-w-[320px]">
                    <div className="flex items-center gap-2.5">
                      <Thumb src={i.avatarUrl} name={i.nickName} rounded />
                      <div className="min-w-0">
                        <div className="font-medium truncate" title={i.nickName}>
                          {i.nickName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                          {i.uniqueId && <span className="font-mono truncate">@{i.uniqueId}</span>}
                          {i.category && <span className="truncate">· {i.category}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {i.ecScore > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-indigo-600 font-medium">
                        <Award className="h-3 w-3" />
                        {i.ecScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(i.totalFollowersCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt(i.totalSaleCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(i.totalSaleGmvAmt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(i.totalProductCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(i.totalPostVideoCnt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(i.totalLiveCnt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
