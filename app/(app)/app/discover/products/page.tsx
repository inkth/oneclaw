import { getMe, apiServer } from "@/lib/api-client";
import { fetchCategories } from "../_components/categories";
import { DiscoverClient } from "./discover-client";

export const metadata = { title: "发现 · TikTok 爆品 · OneClaw" };

const VALID_REGIONS = ["US", "GB", "ID", "TH", "VN", "MY"];

type DecoratedProduct = {
  productId: string;
  name: string;
  region: string;
  avgPriceCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  commissionRate: number;
  totalSaleCnt: number;
  totalSaleGmvCents: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  coverUrls: string[];
  importedProductId: string | null;
  interaction: { isStarred: boolean; tags: string[] } | null;
};

type RanklistResult = {
  state: string;
  fetchedAt?: string | null;
  products: DecoratedProduct[];
};

export default async function DiscoverProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 游客可逛公共爆品榜;登录后走带个性化浮层的工作台端点。
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  const sp = await searchParams;
  const region = VALID_REGIONS.includes(sp.region ?? "") ? sp.region! : "US";
  const rankType = Number(sp.rank_type) || 1;
  const field = Number(sp.field) || 1;
  const categoryId = sp.category_id || null;
  const query = `region=${region}&rank_type=${rankType}&product_rank_field=${field}${categoryId ? `&category_id=${categoryId}` : ""}&page_size=16`;

  const [result, categories] = await Promise.all([
    apiServer<RanklistResult>(
      workspace
        ? `/workspaces/${workspace.id}/discover/ranklist?${query}`
        : `/discover/ranklist?${query}`,
    ).catch((): RanklistResult => ({ state: "error", products: [] })),
    fetchCategories(region),
  ]);

  return (
    <DiscoverClient
      isGuest={!workspace}
      workspaceId={workspace?.id ?? ""}
      region={region as "US" | "GB" | "ID" | "TH" | "VN" | "MY"}
      rankType={rankType as 1 | 2 | 3}
      field={field as 1 | 2 | 3}
      categoryId={categoryId}
      categories={categories}
      state={result.state as "live" | "cached" | "empty" | "mock" | "error"}
      fetchedAt={result.fetchedAt ?? null}
      products={result.products.map((p) => ({
        productId: p.productId,
        productName: p.name,
        region: p.region,
        minPrice: p.minPriceCents / 100,
        maxPrice: p.maxPriceCents / 100,
        avgPrice: p.avgPriceCents / 100,
        commissionRate: p.commissionRate,
        totalSaleCnt: p.totalSaleCnt,
        totalSaleGmvAmt: p.totalSaleGmvCents / 100,
        totalIflCnt: p.totalIflCnt,
        totalVideoCnt: p.totalVideoCnt,
        totalLiveCnt: 0,
        coverUrl: p.coverUrls?.[0] ?? null,
        trend7dPct: null,
        importedProductId: p.importedProductId,
        analysis: null,
        interaction: p.interaction,
      }))}
    />
  );
}
