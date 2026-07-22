"use client";

import { Clapperboard } from "lucide-react";
import { FilterBar, type Region, type CategoryOption } from "../_components/FilterBar";
import { EmptyState, type DiscoverState } from "../_components/shared";
import { Pagination } from "../_components/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { VideoTable, type VideoRow } from "../_components/VideoTable";
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

  const rows: VideoRow[] = videos.map((v) => ({
    videoId: v.videoId,
    cover: v.coverUrl,
    title: v.descZh || v.desc,
    titleAlt: v.descZh && v.descZh !== v.desc ? v.desc : undefined,
    duration: v.duration,
    createTime: v.createTime,
    author: { name: v.nickName, uniqueId: v.uniqueId, avatar: v.avatarUrl, region: v.region },
    views: v.totalViewsCnt,
    digg: v.totalDiggCnt,
    comments: v.totalCommentsCnt,
    shares: v.totalSharesCnt,
    saleCnt: v.totalVideoSaleCnt,
    saleGmv: v.totalVideoSaleGmvAmt,
    href: `/app/discover/videos/${v.videoId}?region=${v.region}`,
    playUrl: v.uniqueId ? `https://www.tiktok.com/@${v.uniqueId}/video/${v.videoId}` : undefined,
  }));

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
        <VideoTable
          rows={rows}
          showRank={!searching}
          // 榜单行数值是「榜单周期增量」(EchoTik 口径),表头按周期如实标注;搜索行为累计,不带周期。
          periodLabel={searching ? "" : (PERIOD_LABEL[rankType] ?? "")}
        />
      )}

      {!searching && <Pagination page={page} hasNext={hasNext} />}
    </div>
  );
}

// 天/周/月榜的数值周期前缀(rank_type 1/2/3)。
const PERIOD_LABEL: Record<number, string> = { 1: "近1天", 2: "近7天", 3: "近30天" };
