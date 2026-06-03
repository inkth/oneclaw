import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

const productCreateSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(80),
  priceCents: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative(),
  marginPct: z.number().int().min(0).max(100),
  roiScore: z.number().int().min(0).max(100),
  monthlySales: z.number().int().nonnegative(),
  trendDelta: z.number().int().optional().default(0),
  status: z.enum(["RECOMMENDED", "EVALUATING", "ARCHIVED"]).optional(),
  emoji: z.string().max(8).optional(),
  note: z.string().max(2000).optional(),
});

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const products = await prisma.product.findMany({
      where: { workspaceId: id },
      orderBy: [{ status: "asc" }, { roiScore: "desc" }, { createdAt: "desc" }],
    });
    return ok({ products });
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
    const data = productCreateSchema.parse(body);

    const product = await prisma.product.create({
      data: { ...data, workspaceId: id },
    });
    return ok({ product }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
