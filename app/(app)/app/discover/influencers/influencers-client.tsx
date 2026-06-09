"use client";

import Link from "next/link";
import { Users, Award } from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { EmptyState, Thumb, type DiscoverState } from "../_components/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { fmt, fmtMoney } from "../_components/format";

export type Influencer = {
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

export function InfluencersClient({
  region,
  rankType,
  field,
  categoryId,
  categories,
  state,
  influencers,
}: {
  region: Region;
  rankType: number;
  field: number;
  categoryId: string | null;
  categories: CategoryOption[];
  state: DiscoverState;
  influencers: Influencer[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-500" />
            选品 · 达人榜
          </span>
        }
        description="各国带货达人榜单 · 看粉丝量、带货 GMV、商品与内容产出 · 找对的人合作"
      />

      <FilterBar
        basePath="/app/discover/influencers"
        region={region}
        rankType={rankType}
        field={field}
        categoryId={categoryId}
        categories={categories}
      />

      {state === "empty" || influencers.length === 0 ? (
        <EmptyState />
      ) : (
        <TableWrap minWidth={940}>
          <THead>
            <tr>
              <Th>#</Th>
              <Th>达人</Th>
              <Th align="right">带货分</Th>
              <Th align="right">粉丝</Th>
              <Th align="right">带货销量</Th>
              <Th align="right">带货 GMV</Th>
              <Th align="right">商品</Th>
              <Th align="right">视频</Th>
              <Th align="right">直播</Th>
            </tr>
          </THead>
          <tbody>
            {influencers.map((i, idx) => (
              <Tr key={i.userId}>
                <Td className="text-zinc-400 tabular-nums">{idx + 1}</Td>
                <Td className="max-w-[320px]">
                  <Link
                    href={`/app/discover/influencers/${i.userId}?region=${i.region}`}
                    className="group flex items-center gap-2.5"
                  >
                    <Thumb src={i.avatarUrl} name={i.nickName} rounded />
                    <div className="min-w-0">
                      <div
                        className="truncate font-medium text-zinc-900 group-hover:text-brand-600"
                        title={i.nickName}
                      >
                        {i.nickName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-2xs text-zinc-500">
                        {i.uniqueId && <span className="truncate font-mono">@{i.uniqueId}</span>}
                        {i.category && <span className="truncate">· {i.category}</span>}
                      </div>
                    </div>
                  </Link>
                </Td>
                <Td align="right">
                  {i.ecScore > 0 ? (
                    <span className="inline-flex items-center gap-0.5 font-medium text-brand-600">
                      <Award className="h-3 w-3" />
                      {i.ecScore.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </Td>
                <Td align="right">{fmt(i.totalFollowersCnt)}</Td>
                <Td align="right" className="font-semibold text-zinc-900">{fmt(i.totalSaleCnt)}</Td>
                <Td align="right">{fmtMoney(i.totalSaleGmvAmt)}</Td>
                <Td align="right">{fmt(i.totalProductCnt)}</Td>
                <Td align="right">{fmt(i.totalPostVideoCnt)}</Td>
                <Td align="right">{fmt(i.totalLiveCnt)}</Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
