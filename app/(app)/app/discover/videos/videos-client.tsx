"use client";

import Link from "next/link";
import { Clapperboard, Play, Eye, Heart, MessageCircle, Share2 } from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { EmptyState, Thumb, type DiscoverState } from "../_components/shared";
import { Pagination } from "../_components/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { RankMedal } from "@/components/ui/RankMedal";
import { fmt, fmtMoney, fmtDuration, fmtUnixDate, stringToGradient, initial } from "../_components/format";
import { useWarmingRefresh } from "../_components/useWarmingRefresh";

export type Video = {
  videoId: string;
  nickName: string;
  uniqueId: string;
  region: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  desc: string;
  descZh: string;
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

export function VideosClient({
  region,
  rankType,
  field,
  categoryId,
  categories,
  keyword = "",
  ai = false,
  state,
  warming,
  videos,
  page,
  hasNext,
}: {
  region: Region;
  rankType: number;
  field: number;
  categoryId: string | null;
  categories: CategoryOption[];
  keyword?: string;
  ai?: boolean;
  state: DiscoverState;
  warming?: boolean;
  videos: Video[];
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
            <Clapperboard className="h-5 w-5 text-brand-500" />
            带货视频榜
          </span>
        }
        description="从高表现带货视频里找选题，拆解开头钩子、内容结构和转化方式。"
      />

      <FilterBar
        basePath="/app/discover/videos"
        region={region}
        rankType={rankType}
        field={field}
        categoryId={categoryId}
        categories={categories}
        keyword={keyword}
        ai={ai}
        searchPlaceholder="搜索视频文案或话题"
      />

      {state === "empty" || videos.length === 0 ? (
        <EmptyState
          hint={
            searching
              ? `没找到与「${keyword}」相关的视频。换个关键词，或切换国家 / 地区再搜。`
              : ai
                ? "该地区 / 类目下暂无 AI 生成的带货视频，换个国家或类目再看看。"
                : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {videos.map((v, idx) => (
            <VideoCard
              key={v.videoId}
              rank={idx + 1}
              video={v}
              // 榜单行数值是「榜单周期增量」(EchoTik 口径),标签按周期如实标注;搜索行为累计,不带周期。
              periodLabel={searching ? "" : (PERIOD_LABEL[rankType] ?? "")}
            />
          ))}
        </div>
      )}

      {!searching && <Pagination page={page} hasNext={hasNext} />}
    </div>
  );
}

// 天/周/月榜的数值周期前缀(rank_type 1/2/3)。
const PERIOD_LABEL: Record<number, string> = { 1: "近1天", 2: "近7天", 3: "近30天" };

function VideoCard({ rank, video: v, periodLabel = "" }: { rank: number; video: Video; periodLabel?: string }) {
  return (
    <Link
      href={`/app/discover/videos/${v.videoId}?region=${v.region}`}
      className="dk-card dk-lift group flex flex-col overflow-hidden"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-100">
        {v.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-white"
            style={{ background: stringToGradient(v.desc || v.nickName) }}
          >
            {initial(v.nickName)}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-zinc-900 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]">
            <Play className="h-3 w-3 fill-zinc-900" />
            查看详情
          </span>
        </div>
        {rank <= 3 ? (
          <span className="absolute left-2 top-2">
            <RankMedal rank={rank} />
          </span>
        ) : (
          <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/60 px-1.5 text-2xs font-semibold tabular-nums text-white">
            {rank}
          </span>
        )}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white">
          <Play className="h-2.5 w-2.5 fill-white" />
          {fmtDuration(v.duration)}
        </span>
        {v.totalViewsCnt > 0 && (
          <span
            className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white"
            title={`${periodLabel}播放`}
          >
            <Eye className="h-2.5 w-2.5" />
            {fmt(v.totalViewsCnt)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p
          className="line-clamp-2 min-h-[2.4em] text-xs leading-snug text-zinc-900"
          title={v.descZh ? `${v.descZh}\n${v.desc}` : v.desc}
        >
          {v.descZh || v.desc || "(无描述)"}
        </p>
        <div className="flex min-w-0 items-center gap-1.5 text-2xs text-zinc-500">
          <Thumb src={v.avatarUrl} name={v.nickName} className="h-5 w-5 rounded-full" rounded />
          <span className="truncate" title={v.nickName}>{v.nickName}</span>
        </div>

        {/* 带货榜行上游不回填播放/互动数（0=缺失），全 0 时整行不渲染，避免看着像坏数据。 */}
        {(v.totalDiggCnt > 0 || v.totalCommentsCnt > 0 || v.totalSharesCnt > 0) && (
          <div className="grid grid-cols-3 gap-1 text-2xs text-zinc-500">
            <Metric icon={<Heart className="h-2.5 w-2.5" />} value={fmt(v.totalDiggCnt)} title={`${periodLabel}点赞`} />
            <Metric icon={<MessageCircle className="h-2.5 w-2.5" />} value={fmt(v.totalCommentsCnt)} title={`${periodLabel}评论`} />
            <Metric icon={<Share2 className="h-2.5 w-2.5" />} value={fmt(v.totalSharesCnt)} title={`${periodLabel}分享`} />
          </div>
        )}

        <div className="mt-auto flex items-center justify-between rounded-lg bg-[var(--dk-surface-2)] px-2 py-1.5">
          <div>
            <div className="text-2xs uppercase tracking-wider text-zinc-400">{periodLabel ? `${periodLabel}销量` : "带货销量"}</div>
            <div className="text-xs font-semibold tabular-nums text-zinc-900">{fmt(v.totalVideoSaleCnt)}</div>
          </div>
          <div className="text-right">
            <div className="text-2xs uppercase tracking-wider text-zinc-400">{periodLabel ? `${periodLabel} GMV` : "带货 GMV"}</div>
            <div className="text-xs font-semibold tabular-nums text-emerald-700">{fmtMoney(v.totalVideoSaleGmvAmt)}</div>
          </div>
        </div>
        <div className="text-2xs text-zinc-400">{fmtUnixDate(v.createTime)} · {v.region}</div>
      </div>
    </Link>
  );
}

function Metric({ icon, value, title }: { icon: React.ReactNode; value: string; title?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums" title={title}>
      {icon}
      {value}
    </span>
  );
}
