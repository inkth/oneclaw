import { getMe, apiServer } from "@/lib/api-client";
import { fetchCategories, fetchCategoryChildren } from "../_components/categories";
import { REGION_CODES, type Region } from "../_components/regions";
import { DiscoverClient } from "./discover-client";

export const metadata = { title: "选品 · 爆品榜 · 发现猫" };

type DecoratedProduct = {
  productId: string;
  name: string;
  nameZh: string;
  region: string;
  avgPriceCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  commissionRate: number;
  totalSaleCnt: number;
  totalSaleGmvCents: number;
  sale7dCnt: number;
  gmv7dCents: number;
  spark7d: number[] | null;
  totalIflCnt: number;
  totalVideoCnt: number;
  coverUrls: string[];
  importedProductId: string | null;
};

type RanklistResult = {
  state: string;
  fetchedAt?: string | null;
  warming?: boolean;
  products: DecoratedProduct[];
};

export default async function DiscoverProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 游客可逛公共爆品榜；登录后走带个性化浮层的工作台端点。
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  const sp = await searchParams;
  const region = REGION_CODES.includes((sp.region ?? "") as Region)
    ? (sp.region as Region)
    : "US";
  const rankType = Number(sp.rank_type) || 1;
  const field = Number(sp.field) || 1;
  const categoryId = sp.category_id || null;
  // 二级/三级类目链:上级未选时下级无效(直链/旧书签容错)。
  const categoryL2Id = (categoryId && sp.category_l2_id) || null;
  const categoryL3Id = (categoryL2Id && sp.category_l3_id) || null;
  const page = Math.min(Math.max(Number(sp.page) || 1, 1), 10);
  const q = (sp.q ?? "").trim();
  // 爆品雷达视图(本地动量榜):hot7d=近7天爆量 / accel=上升黑马。搜索态优先于雷达。
  const view = !q && (sp.view === "hot7d" || sp.view === "accel") ? sp.view : null;
  const catQuery = `${categoryId ? `&category_id=${categoryId}` : ""}${categoryL2Id ? `&category_l2_id=${categoryL2Id}` : ""}${categoryL3Id ? `&category_l3_id=${categoryL3Id}` : ""}`;
  // 搜索：走 EchoTik 关键词搜索（只认 region,单次 ≤30、无分页）;否则正常榜单+分页。
  const query = q
    ? `region=${region}&product_rank_field=${field}&page_size=30&keyword=${encodeURIComponent(q)}`
    : `region=${region}&rank_type=${rankType}&product_rank_field=${field}${catQuery}&page_size=16&page_num=${page}`;
  const path = view
    ? `discover/rising?region=${region}&mode=${view}${catQuery}&limit=20`
    : `discover/ranklist?${query}`;

  const [result, categories, categoriesL2, categoriesL3] = await Promise.all([
    apiServer<RanklistResult>(
      workspace ? `/workspaces/${workspace.id}/${path}` : `/${path}`,
    ).catch((): RanklistResult => ({ state: "error", products: [] })),
    fetchCategories(region),
    fetchCategoryChildren(region, categoryId, 2),
    fetchCategoryChildren(region, categoryL2Id, 3),
  ]);

  return (
    <DiscoverClient
      isGuest={!workspace}
      workspaceId={workspace?.id ?? ""}
      region={region}
      rankType={rankType as 1 | 2 | 3}
      field={field as 1 | 2 | 3}
      categoryId={categoryId}
      categories={categories}
      categoryL2Id={categoryL2Id}
      categoriesL2={categoriesL2}
      categoryL3Id={categoryL3Id}
      categoriesL3={categoriesL3}
      keyword={q}
      state={result.state as "live" | "cached" | "empty" | "error"}
      fetchedAt={result.fetchedAt ?? null}
      warming={result.warming ?? false}
      products={result.products.map((p) => ({
        productId: p.productId,
        productName: p.name,
        productNameZh: p.nameZh ?? "",
        region: p.region,
        minPrice: p.minPriceCents / 100,
        maxPrice: p.maxPriceCents / 100,
        avgPrice: p.avgPriceCents / 100,
        commissionRate: p.commissionRate,
        totalSaleCnt: p.totalSaleCnt,
        totalSaleGmvAmt: p.totalSaleGmvCents / 100,
        sale7dCnt: p.sale7dCnt ?? 0,
        gmv7dAmt: (p.gmv7dCents ?? 0) / 100,
        spark7d: p.spark7d ?? [],
        totalIflCnt: p.totalIflCnt,
        totalVideoCnt: p.totalVideoCnt,
        totalLiveCnt: 0,
        coverUrl: p.coverUrls?.[0] ?? null,
        trend7dPct: null,
        importedProductId: p.importedProductId,
        analysis: null,
      }))}
      view={view}
      page={page}
      hasNext={!q && !view && result.products.length >= 16 && page < 10}
    />
  );
}
