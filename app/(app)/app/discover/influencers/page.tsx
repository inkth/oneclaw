import { safeInfluencerRanklist, safeCategoriesL1 } from "@/lib/echotik/safe";
import type { Region, RankType, EntityRankField } from "@/lib/echotik/types";
import { InfluencersClient } from "./influencers-client";

export const metadata = { title: "选品 · 达人榜 · OneClaw" };

const VALID_REGIONS: Region[] = ["US", "GB", "ID", "TH", "VN", "MY"];

export default async function DiscoverInfluencersPage({
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
    safeInfluencerRanklist({
      region,
      rank_type: rankType,
      rank_field: field,
      category_id: categoryId ?? undefined,
      page_size: 20,
    }),
    safeCategoriesL1(region),
  ]);

  return (
    <InfluencersClient
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
      state={result.state}
      fetchedAt={result.fetchedAt?.toISOString() ?? null}
      influencers={result.rows.map((i) => ({
        userId: i.user_id,
        uniqueId: i.unique_id,
        nickName: i.nick_name,
        region: i.region,
        avatarUrl: (i.avatar && result.signed[i.avatar]) || null,
        category: i.category,
        ecScore: i.ec_score,
        totalFollowersCnt: i.total_followers_cnt,
        totalDiggCnt: i.total_digg_cnt,
        totalProductCnt: i.total_product_cnt,
        totalPostVideoCnt: i.total_post_video_cnt,
        totalLiveCnt: i.total_live_cnt,
        totalSaleCnt: i.total_sale_cnt,
        totalSaleGmvAmt: i.total_sale_gmv_amt,
      }))}
    />
  );
}
