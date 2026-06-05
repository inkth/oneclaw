import { safeSellerRanklist, safeCategoriesL1 } from "@/lib/echotik/safe";
import type { Region, RankType, EntityRankField } from "@/lib/echotik/types";
import { parseCategoryNames } from "@/lib/echotik/format";
import { SellersClient } from "./sellers-client";

export const metadata = { title: "选品 · 店铺榜 · OneClaw" };

const VALID_REGIONS: Region[] = ["US", "GB", "ID", "TH", "VN", "MY"];

export default async function DiscoverSellersPage({
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
    safeSellerRanklist({
      region,
      rank_type: rankType,
      rank_field: field,
      category_id: categoryId ?? undefined,
      page_size: 20,
    }),
    safeCategoriesL1(region),
  ]);

  return (
    <SellersClient
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
      state={result.state}
      fetchedAt={result.fetchedAt?.toISOString() ?? null}
      sellers={result.rows.map((s) => ({
        sellerId: s.seller_id,
        sellerName: s.seller_name,
        region: s.region,
        coverUrl: (s.cover_url && result.signed[s.cover_url]) || null,
        rating: s.rating,
        categories: parseCategoryNames(s.most_product_category_list),
        totalProductCnt: s.total_product_cnt,
        totalSaleCnt: s.total_sale_cnt,
        totalSaleGmvAmt: s.total_sale_gmv_amt,
        totalIflCnt: s.total_ifl_cnt,
        totalVideoCnt: s.total_video_cnt,
        totalLiveCnt: s.total_live_cnt,
      }))}
    />
  );
}
