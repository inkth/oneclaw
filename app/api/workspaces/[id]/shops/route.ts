import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  platform: z.enum([
    "TIKTOK_SHOP",
    "AMAZON",
    "SHOPIFY",
    "LAZADA",
    "SHOPEE",
    "TEMU",
    "OTHER",
  ]),
  country: z.string().min(2).max(8).optional(),
  externalId: z.string().max(120).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const shops = await prisma.shop.findMany({
      where: { workspaceId: id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { products: true } } },
    });

    // 汇总指标
    const totals = shops.reduce(
      (acc, s) => ({
        revenueCents: acc.revenueCents + s.totalRevenueCents,
        orders: acc.orders + s.orders,
        itemsSold: acc.itemsSold + s.itemsSold,
        visitors: acc.visitors + s.visitors,
      }),
      { revenueCents: 0, orders: 0, itemsSold: 0, visitors: 0 },
    );

    return ok({ shops, totals });
  } catch (err) {
    return handleError(err);
  }
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

    const body = await req.json();
    const data = createSchema.parse(body);

    const shop = await prisma.shop.create({
      data: {
        workspaceId: id,
        name: data.name,
        platform: data.platform,
        country: data.country,
        externalId: data.externalId,
        status: "PENDING", // 真实平台对接前先 PENDING；接到 API 后 webhook 改 CONNECTED
      },
    });
    return ok({ shop }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
