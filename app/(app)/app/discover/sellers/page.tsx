import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../_components/regions";
import { type DiscoverState } from "../_components/shared";
import { fetchCategories } from "../_components/categories";
import { SellersClient, type Seller } from "./sellers-client";

export const metadata = { title: "选品 · 店铺榜 · OneClaw" };

type Result = { state: DiscoverState; fetchedAt: string | null; rows: Seller[] };

export default async function DiscoverSellersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (REGION_CODES.includes(sp.region as Region) ? sp.region : "US") as Region;
  const rankType = Number(sp.rank_type) || 1;
  const field = Number(sp.field) === 2 ? 2 : 1;
  const categoryId = sp.category_id || null;
  const page = Math.min(Math.max(Number(sp.page) || 1, 1), 10);
  const q = (sp.q ?? "").trim();
  // 搜索:走 EchoTik 关键词搜索(只认 region,单次 ≤30、无分页);否则正常榜单+分页。
  const query = q
    ? `region=${region}&field=${field}&page_size=30&keyword=${encodeURIComponent(q)}`
    : `region=${region}&rank_type=${rankType}&field=${field}${categoryId ? `&category_id=${categoryId}` : ""}&page_size=20&page_num=${page}`;

  const [result, categories] = await Promise.all([
    apiServer<Result>(`/discover/seller-ranklist?${query}`).catch(
      (): Result => ({ state: "error", fetchedAt: null, rows: [] }),
    ),
    fetchCategories(region),
  ]);

  return (
    <SellersClient
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
      keyword={q}
      state={result.state}
      sellers={result.rows}
      page={page}
      hasNext={!q && result.rows.length >= 20 && page < 10}
    />
  );
}
