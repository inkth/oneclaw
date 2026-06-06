import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { safeRanklist, safeCategoriesL1 } from "@/lib/echotik/safe";
import { REGION_CODES, type Region, type RankType, type RankField } from "@/lib/echotik/types";
import { DiscoverClient, type DiscoverOverlayMap } from "./discover-client";

export const metadata = { title: "发现 · TikTok 爆品 · OneClaw" };

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
  const region = (REGION_CODES.includes(sp.region as Region)
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

  // 个性化浮层（已导入 / 已分析 / 已收藏）不阻塞首屏：把这 3 个查询包成一个 Promise
  // 流式传给 client（含那条按 metadata jsonb 过滤、随分析数据增长而变慢的 ANALYST 查询）。
  // 榜单 + 类目就绪即可渲染表格，徽标随后补入。游客无 workspace → 空浮层。
  const externalIds = result.products.map((p) => p.product_id);
  const overlayPromise: Promise<DiscoverOverlayMap> =
    workspace && externalIds.length
      ? loadOverlay(workspace.id, region, externalIds)
      : Promise.resolve({});

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
      overlay={overlayPromise}
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
