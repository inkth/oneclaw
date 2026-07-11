import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../_components/regions";
import { type DiscoverState } from "../_components/shared";
import { fetchCategories } from "../_components/categories";
import { InfluencersClient, type Influencer } from "./influencers-client";

export const metadata = { title: "选品 · 达人榜 · 发现猫" };

type Result = { state: DiscoverState; fetchedAt: string | null; rows: Influencer[] };

export default async function DiscoverInfluencersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (REGION_CODES.includes(sp.region as Region) ? sp.region : "US") as Region;
  const rankType = Number(sp.rank_type) || 1;
  // 默认带货榜（influencer_rank_field=2, total_sale_cnt）;1=粉丝榜。
  const field = Number(sp.field) === 1 ? 1 : 2;
  const categoryId = sp.category_id || null;
  const page = Math.min(Math.max(Number(sp.page) || 1, 1), 10);
  const q = (sp.q ?? "").trim();
  // 类目=按「带货商品类目」过滤（后端映射到 EchoTik product_category_id）。
  // 搜索：走关键词搜索（只认 region,单次 ≤30、无分页）;否则正常榜单+类目+分页。
  const query = q
    ? `region=${region}&page_size=30&keyword=${encodeURIComponent(q)}`
    : `region=${region}&rank_type=${rankType}&field=${field}${categoryId ? `&category_id=${categoryId}` : ""}&page_size=20&page_num=${page}`;

  const [result, categories] = await Promise.all([
    apiServer<Result>(`/discover/influencer-ranklist?${query}`).catch(
      (): Result => ({ state: "error", fetchedAt: null, rows: [] }),
    ),
    fetchCategories(region),
  ]);

  return (
    <InfluencersClient
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
      keyword={q}
      state={result.state}
      influencers={result.rows}
      page={page}
      hasNext={!q && result.rows.length >= 20 && page < 10}
    />
  );
}
