import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { safeRanklist } from "@/lib/echotik/safe";
import type { Region, RankType, RankField } from "@/lib/echotik/types";
import { DiscoverClient } from "./discover-client";

export const metadata = { title: "发现 · TikTok 爆品 · OneClaw" };

const VALID_REGIONS: Region[] = ["US", "GB", "ID", "TH", "VN", "MY"];

export default async function DiscoverProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  const sp = await searchParams;
  const region = (VALID_REGIONS.includes(sp.region as Region)
    ? sp.region
    : "US") as Region;
  const rankType = (Number(sp.rank_type) || 1) as RankType;
  const field = (Number(sp.field) || 1) as RankField;

  const result = await safeRanklist({
    region,
    rank_type: rankType,
    product_rank_field: field,
    page_size: 16,
  });

  // 计算交集：这批 EchoTik 商品里，哪些已经被 import / 分析 / 收藏
  const externalIds = result.products.map((p) => p.product_id);
  const [importedProducts, recentAnalyses, interactions] = await Promise.all([
    externalIds.length
      ? prisma.product.findMany({
          where: {
            workspaceId: workspace.id,
            discoverProduct: {
              provider: "echotik",
              region,
              externalId: { in: externalIds },
            },
          },
          select: {
            id: true,
            status: true,
            discoverProduct: { select: { externalId: true } },
          },
        })
      : Promise.resolve([]),
    externalIds.length
      ? prisma.agentTask.findMany({
          where: {
            workspaceId: workspace.id,
            agent: "ANALYST",
            createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            status: true,
            createdAt: true,
            metadata: true,
          },
        })
      : Promise.resolve([]),
    externalIds.length
      ? prisma.workspaceDiscoverInteraction.findMany({
          where: {
            workspaceId: workspace.id,
            discoverProduct: {
              provider: "echotik",
              region,
              externalId: { in: externalIds },
            },
          },
          include: { discoverProduct: { select: { externalId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const importedByExtId = new Map<string, { productId: string; status: string }>();
  for (const p of importedProducts) {
    const extId = p.discoverProduct?.externalId;
    if (extId) importedByExtId.set(extId, { productId: p.id, status: p.status });
  }

  // 取每个 externalId 最近一次的 ANALYST 任务
  const analysisByExtId = new Map<
    string,
    { taskId: string; status: string; createdAt: string; verdict?: string }
  >();
  for (const t of recentAnalyses) {
    const meta = t.metadata as Record<string, unknown> | null;
    if (!meta || meta.source !== "discover.echotik") continue;
    if (meta.region !== region) continue;
    const extId = meta.productId as string | undefined;
    if (!extId || analysisByExtId.has(extId)) continue;
    analysisByExtId.set(extId, {
      taskId: t.id,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      verdict: (meta.verdict as string | undefined) ?? undefined,
    });
  }

  const interactionByExtId = new Map<string, { isStarred: boolean; tags: string[] }>();
  for (const it of interactions) {
    const extId = it.discoverProduct.externalId;
    interactionByExtId.set(extId, { isStarred: it.isStarred, tags: it.tags });
  }

  return (
    <DiscoverClient
      workspaceId={workspace.id}
      region={region}
      rankType={rankType}
      field={field}
      state={result.state}
      fetchedAt={result.fetchedAt?.toISOString() ?? null}
      products={result.products.map((p) => ({
        productId: p.product_id,
        productName: p.product_name,
        region: p.region,
        minPrice: p.min_price,
        maxPrice: p.max_price,
        avgPrice: p.spu_avg_price,
        commissionRate: p.product_commission_rate,
        totalSaleCnt: p.total_sale_cnt,
        totalSaleGmvAmt: p.total_sale_gmv_amt,
        totalIflCnt: p.total_ifl_cnt,
        totalVideoCnt: p.total_video_cnt,
        totalLiveCnt: p.total_live_cnt,
        coverUrl: p.coverUrls?.[0]?.url ?? null,
        trend7dPct: p.trend7dPct ?? null,
        importedProductId: importedByExtId.get(p.product_id)?.productId ?? null,
        analysis: analysisByExtId.get(p.product_id) ?? null,
        interaction: interactionByExtId.get(p.product_id) ?? null,
      }))}
    />
  );
}
