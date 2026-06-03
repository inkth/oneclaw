import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(80).optional(),
  emoji: z.string().max(8).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  costCents: z.number().int().nonnegative().optional(),
  marginPct: z.number().int().min(0).max(100).optional(),
  roiScore: z.number().int().min(0).max(100).optional(),
  monthlySales: z.number().int().nonnegative().optional(),
  trendDelta: z.number().int().optional(),
  status: z.enum(["RECOMMENDED", "EVALUATING", "ARCHIVED"]).optional(),
  note: z.string().max(2000).nullable().optional(),
});

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

async function ensureOwnership(productId: string, workspaceId: string) {
  const p = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
    select: { id: true },
  });
  return !!p;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, productId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const product = await prisma.product.findFirst({
      where: { id: productId, workspaceId: id },
      include: { videos: { select: { id: true, title: true, processing: true, thumbnailUrl: true } } },
    });
    if (!product) return fail("不存在", 404);
    return ok({ product });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, productId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);
    if (!(await ensureOwnership(productId, id))) return fail("不存在", 404);

    const body = await req.json();
    const data = patchSchema.parse(body);

    const product = await prisma.product.update({
      where: { id: productId },
      data,
    });
    return ok({ product });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, productId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);
    if (!(await ensureOwnership(productId, id))) return fail("不存在", 404);

    await prisma.product.delete({ where: { id: productId } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
