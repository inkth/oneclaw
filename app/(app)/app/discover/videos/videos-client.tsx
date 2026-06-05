"use client";

import { Clapperboard, Play, Eye, Heart, MessageCircle, Share2 } from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { StateBadge, MockNotice, EmptyState, Thumb, type DiscoverState } from "../_components/shared";
import { fmt, fmtMoney, fmtDuration, fmtUnixDate, stringToGradient, initial } from "@/lib/echotik/format";

type Video = {
  videoId: string;
  nickName: string;
  uniqueId: string;
  region: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  desc: string;
  category: string;
  duration: number;
  createTime: string;
  totalViewsCnt: number;
  totalDiggCnt: number;
  totalCommentsCnt: number;
  totalSharesCnt: number;
  totalVideoSaleCnt: number;
  totalVideoSaleGmvAmt: number;
};

const FIELDS = [
  { v: 1, cn: "带货销量" },
  { v: 2, cn: "带货 GMV" },
];

export function VideosClient({
  region,
  rankType,
  field,
  categoryId,
  categories,
  state,
  fetchedAt,
  videos,
}: {
  region: Region;
  rankType: number;
  field: number;
  categoryId: string | null;
  categories: CategoryOption[];
  state: DiscoverState;
  fetchedAt: string | null;
  videos: Video[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-indigo-500" />
          选品 · 带货视频榜
          <StateBadge state={state} fetchedAt={fetchedAt} />
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          各国带货短视频榜单 · 看播放、互动与转化 · 拆解爆款脚本和带货玩法
        </p>
      </div>

      {state === "mock" && <MockNotice />}

      <FilterBar
        basePath="/app/discover/videos"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {videos.map((v, idx) => (
            <VideoCard key={v.videoId} rank={idx + 1} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({ rank, video: v }: { rank: number; video: Video }) {
  return (
    <div className="group rounded-2xl border border-zinc-200 bg-white overflow-hidden flex flex-col">
      <div className="relative aspect-[3/4] w-full bg-zinc-100">
        {v.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center text-3xl font-bold text-white"
            style={{ background: stringToGradient(v.desc || v.nickName) }}
          >
            {initial(v.nickName)}
          </div>
        )}
        <span className="absolute top-2 left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/60 px-1.5 text-[11px] font-semibold text-white tabular-nums">
          {rank}
        </span>
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Play className="h-2.5 w-2.5 fill-white" />
          {fmtDuration(v.duration)}
        </span>
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Eye className="h-2.5 w-2.5" />
          {fmt(v.totalViewsCnt)}
        </span>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-xs leading-snug line-clamp-2 min-h-[2.4em]" title={v.desc}>
          {v.desc || "（无描述）"}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 min-w-0">
          <Thumb src={v.avatarUrl} name={v.nickName} className="h-5 w-5 rounded-full" rounded />
          <span className="truncate" title={v.nickName}>{v.nickName}</span>
        </div>

        <div className="mt-auto grid grid-cols-3 gap-1 text-[10px] text-zinc-500">
          <Metric icon={<Heart className="h-2.5 w-2.5" />} value={fmt(v.totalDiggCnt)} />
          <Metric icon={<MessageCircle className="h-2.5 w-2.5" />} value={fmt(v.totalCommentsCnt)} />
          <Metric icon={<Share2 className="h-2.5 w-2.5" />} value={fmt(v.totalSharesCnt)} />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-zinc-400">带货销量</div>
            <div className="font-semibold tabular-nums">{fmt(v.totalVideoSaleCnt)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-zinc-400">带货 GMV</div>
            <div className="font-semibold tabular-nums text-emerald-700">{fmtMoney(v.totalVideoSaleGmvAmt)}</div>
          </div>
        </div>
        <div className="text-[10px] text-zinc-400">{fmtUnixDate(v.createTime)} · {v.region}</div>
      </div>
    </div>
  );
}

function Metric({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {icon}
      {value}
    </span>
  );
}
