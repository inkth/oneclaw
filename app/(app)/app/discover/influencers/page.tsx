import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../_components/regions";
import { type DiscoverState } from "../_components/shared";
import { InfluencersClient, type Influencer } from "./influencers-client";

export const metadata = { title: "选品 · 达人榜 · OneClaw" };

type Result = { state: DiscoverState; fetchedAt: string | null; rows: Influencer[] };

export default async function DiscoverInfluencersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (REGION_CODES.includes(sp.region as Region) ? sp.region : "US") as Region;
  const rankType = Number(sp.rank_type) || 1;
  const field = Number(sp.field) === 2 ? 2 : 1;
  const page = Math.min(Math.max(Number(sp.page) || 1, 1), 10);
  const q = (sp.q ?? "").trim();
  // EchoTik 达人榜不支持按商品类目过滤,故不提供分类筛选(避免「点了没反应」的假筛选)。
  // 搜索:走关键词搜索(只认 region,单次 ≤30、无分页);否则正常榜单+分页。
  const query = q
    ? `region=${region}&page_size=30&keyword=${encodeURIComponent(q)}`
    : `region=${region}&rank_type=${rankType}&field=${field}&page_size=20&page_num=${page}`;
  const result = await apiServer<Result>(`/discover/influencer-ranklist?${query}`).catch(
    (): Result => ({ state: "error", fetchedAt: null, rows: [] }),
  );

  return (
    <InfluencersClient
      region={region}
      rankType={rankType}
      field={field}
      keyword={q}
      state={result.state}
      influencers={result.rows}
      page={page}
      hasNext={!q && result.rows.length >= 20 && page < 10}
    />
  );
}
