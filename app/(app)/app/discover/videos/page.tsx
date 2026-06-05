import { safeVideoRanklist, safeCategoriesL1 } from "@/lib/echotik/safe";
import type { Region, RankType, EntityRankField } from "@/lib/echotik/types";
import { VideosClient } from "./videos-client";

export const metadata = { title: "选品 · 带货视频榜 · OneClaw" };

const VALID_REGIONS: Region[] = ["US", "GB", "ID", "TH", "VN", "MY"];

export default async function DiscoverVideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (VALID_REGIONS.includes(sp.region as Region) ? sp.region : "US") as Region;
  const rankType = (Number(sp.rank_type) || 1) as RankType;
  const field = (Number(sp.field) === 2 ? 2 : 1) as EntityRankField;
  const categoryId = sp.category_id || null;

  const [result, categories] = await Promise.all([
    safeVideoRanklist({
      region,
      rank_type: rankType,
      rank_field: field,
      category_id: categoryId ?? undefined,
      page_size: 20,
    }),
    safeCategoriesL1(region),
  ]);

  return (
    <VideosClient
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
      state={result.state}
      fetchedAt={result.fetchedAt?.toISOString() ?? null}
      videos={result.rows.map((v) => ({
        videoId: v.video_id,
        nickName: v.nick_name,
        uniqueId: v.unique_id,
        region: v.region,
        coverUrl: (v.reflow_cover && result.signed[v.reflow_cover]) || null,
        avatarUrl: (v.avatar && result.signed[v.avatar]) || null,
        desc: v.video_desc,
        category: v.category,
        duration: v.duration,
        createTime: v.create_time,
        totalViewsCnt: v.total_views_cnt,
        totalDiggCnt: v.total_digg_cnt,
        totalCommentsCnt: v.total_comments_cnt,
        totalSharesCnt: v.total_shares_cnt,
        totalVideoSaleCnt: v.total_video_sale_cnt,
        totalVideoSaleGmvAmt: v.total_video_sale_gmv_amt,
      }))}
    />
  );
}
