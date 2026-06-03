import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(800).optional(),
  emoji: z.string().max(8).optional(),
  engine: z.string().min(1),
  durationSec: z.number().int().min(3).max(30),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  style: z.enum(["UNBOXING", "COMPARISON", "SCENE", "BEFORE_AFTER"]),
  promptTemplate: z.string().min(5).max(2000),
  defaultProductId: z.string().optional(),
  defaultModelAssetId: z.string().optional(),
  defaultMaterialIds: z.array(z.string()).max(6).default([]),
  generateScript: z.boolean().default(false),
  generateCover: z.boolean().default(true),
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

    const templates = await prisma.creationTemplate.findMany({
      where: { workspaceId: id },
      orderBy: [{ isFavorite: "desc" }, { usageCount: "desc" }, { createdAt: "desc" }],
    });
    return ok({ templates });
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

    // 关联校验
    if (data.defaultProductId) {
      const p = await prisma.product.findFirst({
        where: { id: data.defaultProductId, workspaceId: id },
        select: { id: true },
      });
      if (!p) return fail("商品不存在", 404);
    }
    if (data.defaultModelAssetId) {
      const m = await prisma.modelAsset.findFirst({
        where: { id: data.defaultModelAssetId, workspaceId: id },
        select: { id: true },
      });
      if (!m) return fail("模特不存在", 404);
    }
    if (data.defaultMaterialIds.length > 0) {
      const count = await prisma.material.count({
        where: { id: { in: data.defaultMaterialIds }, workspaceId: id },
      });
      if (count !== data.defaultMaterialIds.length) {
        return fail("部分素材不存在", 404);
      }
    }

    const template = await prisma.creationTemplate.create({
      data: { ...data, workspaceId: id },
    });
    return ok({ template }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
