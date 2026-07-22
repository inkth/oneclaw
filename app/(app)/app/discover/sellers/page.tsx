import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../_components/regions";
import { type DiscoverState } from "../_components/shared";
import { fetchCategories, fetchCategoryChildren } from "../_components/categories";
import { SellersClient, type Seller } from "./sellers-client";

export const metadata = { title: "选品 · 店铺榜 · 发现猫" };

type Result = { state: DiscoverState; fetchedAt: string | null; warming?: boolean; rows: Seller[] };

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
  // 二级/三级类目链:上级未选时下级无效(直链/旧书签容错)。
  const categoryL2Id = (categoryId && sp.category_l2_id) || null;
  const categoryL3Id = (categoryL2Id && sp.category_l3_id) || null;
  const page = Math.min(Math.max(Number(sp.page) || 1, 1), 10);
  const q = (sp.q ?? "").trim();
  const catQuery = `${categoryId ? `&category_id=${categoryId}` : ""}${categoryL2Id ? `&category_l2_id=${categoryL2Id}` : ""}${categoryL3Id ? `&category_l3_id=${categoryL3Id}` : ""}`;
  // 搜索：走 EchoTik 关键词搜索（只认 region,单次 ≤30、无分页）;否则正常榜单+分页。
  const query = q
    ? `region=${region}&field=${field}&page_size=30&keyword=${encodeURIComponent(q)}`
    : `region=${region}&rank_type=${rankType}&field=${field}${catQuery}&page_size=20&page_num=${page}`;

  const [result, categories, categoriesL2, categoriesL3] = await Promise.all([
    apiServer<Result>(`/discover/seller-ranklist?${query}`).catch(
      (): Result => ({ state: "error", fetchedAt: null, rows: [] }),
    ),
    fetchCategories(region),
    fetchCategoryChildren(region, categoryId, 2),
    fetchCategoryChildren(region, categoryL2Id, 3),
  ]);

  return (
    <SellersClient
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
      categoryL2Id={categoryL2Id}
      categoriesL2={categoriesL2}
      categoryL3Id={categoryL3Id}
      categoriesL3={categoriesL3}
      keyword={q}
      state={result.state}
      warming={result.warming ?? false}
      sellers={result.rows}
      page={page}
      hasNext={!q && result.rows.length >= 20 && page < 10}
    />
  );
}
