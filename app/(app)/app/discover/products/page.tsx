import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { safeRanklist, safeCategoriesL1 } from "@/lib/echotik/safe";
import type { Region, RankType, RankField } from "@/lib/echotik/types";
import { DiscoverClient } from "./discover-client";

export const metadata = { title: "发现 · TikTok 爆品 · OneClaw" };

const VALID_REGIONS: Region[] = ["US", "GB", "ID", "TH", "VN", "MY"];

export default async function DiscoverProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 游客也能逛公共趋势榜；「我的导入/分析/收藏」浮层无 workspace 时留空，
  // 导入/分析/收藏等动作再提示登录。
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  const sp = await searchParams;
  const region = (VALID_REGIONS.includes(sp.region as Region)
    ? sp.region
    : "US") as Region;
  const rankType = (Number(sp.rank_type) || 1) as RankType;
  const field = (Number(sp.field) || 1) as RankField;
  const categoryId = sp.category_id || null;

  const [result, categories] = await Promise.all([
    safeRanklist({
      region,
      rank_type: rankType,
      product_rank_field: field,
      category_id: categoryId ?? undefined,
      page_size: 16,
    }),
    safeCategoriesL1(region),
  ]);

  // 计算交集：这批 EchoTik 商品里，哪些已经被 import / 分析 / 收藏
  const externalIds = result.products.map((p) => p.product_id);
  const [importedProducts, recentAnalyses, interactions] = await Promise.all([
    workspace && externalIds.length
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
    workspace && externalIds.length
      ? prisma.agentTask.findMany({
          // 直接在 DB 把 productId/region 过滤下推到 metadata（jsonb），
          // 而不是捞 30 天全部 ANALYST 任务再内存筛——后者数据越多越慢。
          where: {
            workspaceId: workspace.id,
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
          select: {
            id: true,
            status: true,
            createdAt: true,
            metadata: true,
          },
        })
      : Promise.resolve([]),
    workspace && externalIds.length
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
    // DB 已按 source/region/productId 过滤，这里只做「每个商品取最近一次」的去重。
    const meta = t.metadata as Record<string, unknown> | null;
    const extId = meta?.productId as string | undefined;
    if (!extId || analysisByExtId.has(extId)) continue;
    analysisByExtId.set(extId, {
      taskId: t.id,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      verdict: (meta?.verdict as string | undefined) ?? undefined,
    });
  }

  const interactionByExtId = new Map<string, { isStarred: boolean; tags: string[] }>();
  for (const it of interactions) {
    const extId = it.discoverProduct.externalId;
    interactionByExtId.set(extId, { isStarred: it.isStarred, tags: it.tags });
  }

  return (
    <DiscoverClient
      isGuest={!workspace}
      workspaceId={workspace?.id ?? ""}
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
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
