import { redirect } from "next/navigation";
import { getMe, apiServer } from "@/lib/api-client";
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
  const me = await getMe();
  if (!me) redirect("/login?callbackUrl=/app/discover/products");
  const workspace = me.workspace;

  const sp = await searchParams;
  const region = VALID_REGIONS.includes(sp.region ?? "") ? sp.region! : "US";
  const rankType = Number(sp.rank_type) || 1;
  const field = Number(sp.field) || 1;

  let result: RanklistResult = { state: "empty", products: [] };
  try {
    result = await apiServer<RanklistResult>(
      `/workspaces/${workspace.id}/discover/ranklist?region=${region}&rank_type=${rankType}&product_rank_field=${field}&page_size=16`,
    );
  } catch {
    result = { state: "error", products: [] };
  }

  return (
    <DiscoverClient
      workspaceId={workspace.id}
      region={region as "US" | "GB" | "ID" | "TH" | "VN" | "MY"}
      rankType={rankType as 1 | 2 | 3}
      field={field as 1 | 2 | 3}
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

/**
 * 查这批 EchoTik 商品里哪些已被当前 workspace import / 分析 / 收藏。
 * 不在请求主路径上 await——由 page 包成 Promise 流式交给 client，徽标延后补入。
 */
async function loadOverlay(
  workspaceId: string,
  region: Region,
  externalIds: string[],
): Promise<DiscoverOverlayMap> {
  try {
    return await loadOverlayInner(workspaceId, region, externalIds);
  } catch (e) {
    // 浮层是锦上添花：任何查询出错都降级成空浮层，绝不让这个流式 promise reject
    // （reject 会变成客户端的 unhandled rejection）。
    console.error("[discover] loadOverlay failed (non-fatal)", e);
    return {};
  }
}

async function loadOverlayInner(
  workspaceId: string,
  region: Region,
  externalIds: string[],
): Promise<DiscoverOverlayMap> {
  const [importedProducts, recentAnalyses, interactions] = await Promise.all([
    prisma.product.findMany({
      where: {
        workspaceId,
        discoverProduct: { provider: "echotik", region, externalId: { in: externalIds } },
      },
      select: {
        id: true,
        status: true,
        discoverProduct: { select: { externalId: true } },
      },
    }),
    prisma.agentTask.findMany({
      // 直接在 DB 把 productId/region 过滤下推到 metadata（jsonb），
      // 而不是捞 30 天全部 ANALYST 任务再内存筛——后者数据越多越慢。
      where: {
        workspaceId,
        agent: "ANALYST",
        AND: [
          { metadata: { path: ["source"], equals: "discover.echotik" } },
          { metadata: { path: ["region"], equals: region } },
          {
            OR: externalIds.map((pid) => ({
              metadata: { path: ["productId"], equals: pid },
            })),
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, metadata: true },
    }),
    prisma.workspaceDiscoverInteraction.findMany({
      where: {
        workspaceId,
        discoverProduct: { provider: "echotik", region, externalId: { in: externalIds } },
      },
      include: { discoverProduct: { select: { externalId: true } } },
    }),
  ]);

  const overlay: DiscoverOverlayMap = {};
  const entry = (extId: string) =>
    (overlay[extId] ??= { importedProductId: null, analysis: null, interaction: null });

  for (const p of importedProducts) {
    const extId = p.discoverProduct?.externalId;
    if (extId) entry(extId).importedProductId = p.id;
  }

  // 取每个 externalId 最近一次的 ANALYST 任务（DB 已按 source/region/productId 过滤）
  for (const t of recentAnalyses) {
    const meta = t.metadata as Record<string, unknown> | null;
    const extId = meta?.productId as string | undefined;
    if (!extId) continue;
    const e = entry(extId);
    if (e.analysis) continue; // 已记录更近一次的
    e.analysis = {
      taskId: t.id,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      verdict: (meta?.verdict as string | undefined) ?? undefined,
    };
  }

  for (const it of interactions) {
    entry(it.discoverProduct.externalId).interaction = {
      isStarred: it.isStarred,
      tags: it.tags,
    };
  }

  return overlay;
}
