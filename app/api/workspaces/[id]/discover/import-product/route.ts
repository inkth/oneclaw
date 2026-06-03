import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { toProductCreate } from "@/lib/echotik/transform";
import { mockRanklist } from "@/lib/echotik/mock";
import { isEchoTikConfigured } from "@/lib/echotik/safe";
import { getProductDetail } from "@/lib/echotik/client";
import { getDiscoverProduct } from "@/lib/echotik/cache";
import type { ProductListItem } from "@/lib/echotik/types";

const schema = z.object({
  productId: z.string().min(1),
  region: z.enum(["US", "GB", "ID", "TH", "VN", "MY"]),
  categoryLabel: z.string().max(80).optional(),
});

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const rl = await rateLimit({
      key: `discover-import:${id}`,
      limit: 100,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("操作过于频繁", 429);

    const body = await req.json();
    const { productId, region, categoryLabel } = schema.parse(body);

    // 1. 优先用本地 DiscoverProduct（来自 ranklist 时已 upsert）
    const dp = await getDiscoverProduct(productId, region);

    // 2. 若本地没有，且 EchoTik 已配置 → 拉 detail 并 upsert
    let source: ProductListItem | null = dp
      ? {
          product_id: dp.externalId,
          product_name: dp.name,
          region: dp.region,
          category_id: dp.categoryId ?? "",
          category_l2_id: dp.categoryL2Id ?? "",
          category_l3_id: dp.categoryL3Id ?? "",
          min_price: dp.minPriceCents / 100,
          max_price: dp.maxPriceCents / 100,
          spu_avg_price: dp.avgPriceCents / 100,
          product_commission_rate: dp.commissionRate,
          total_sale_cnt: dp.totalSaleCnt,
          total_sale_gmv_amt: dp.totalSaleGmvCents / 100,
          total_ifl_cnt: dp.totalIflCnt,
          total_video_cnt: dp.totalVideoCnt,
          total_live_cnt: dp.totalLiveCnt,
        }
      : null;

    if (!source && isEchoTikConfigured()) {
      try {
        const detail = await getProductDetail(productId, region);
        if (detail) source = detail;
      } catch (e) {
        console.error("[discover/import] EchoTik detail failed", e);
      }
    }
    if (!source) {
      // mock fallback
      const found = mockRanklist(region, 16).find((p) => p.product_id === productId);
      if (!found) return fail("找不到该商品", 404);
      source = found;
    }

    // 确保 DiscoverProduct 也存在（detail 路径过来时本地没有）
    const ensured = dp
      ? dp
      : await prisma.discoverProduct.upsert({
          where: {
            provider_externalId_region: {
              provider: "echotik",
              externalId: source.product_id,
              region: source.region,
            },
          },
          create: {
            provider: "echotik",
            externalId: source.product_id,
            region: source.region,
            name: source.product_name,
            categoryId: source.category_id || null,
            categoryL2Id: source.category_l2_id || null,
            categoryL3Id: source.category_l3_id || null,
            minPriceCents: Math.round(source.min_price * 100),
            maxPriceCents: Math.round(source.max_price * 100),
            avgPriceCents: Math.round(source.spu_avg_price * 100),
            commissionRate: source.product_commission_rate,
            totalSaleCnt: source.total_sale_cnt,
            totalSaleGmvCents: Math.round(source.total_sale_gmv_amt * 100),
            totalIflCnt: source.total_ifl_cnt,
            totalVideoCnt: source.total_video_cnt,
            totalLiveCnt: source.total_live_cnt,
          },
          update: { lastFetchedAt: new Date() },
        });

    // 同 workspace 不能重复导入：靠 unique(workspaceId, discoverProductId)
    const existing = await prisma.product.findFirst({
      where: { workspaceId: id, discoverProductId: ensured.id },
    });
    if (existing) {
      return ok({ product: existing, alreadyExists: true });
    }

    const product = await prisma.product.create({
      data: {
        ...toProductCreate({ workspaceId: id, product: source, categoryLabel }),
        discoverProductId: ensured.id,
      },
    });

    return ok({ product, alreadyExists: false }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
