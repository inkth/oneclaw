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

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  style: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
  isFavorite: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, modelId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const owned = await prisma.modelAsset.findFirst({
      where: { id: modelId, workspaceId: id },
      select: { id: true },
    });
    if (!owned) return fail("不存在", 404);

    const body = await req.json();
    const data = patchSchema.parse(body);
    const model = await prisma.modelAsset.update({ where: { id: modelId }, data });
    return ok({ model });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, modelId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const owned = await prisma.modelAsset.findFirst({
      where: { id: modelId, workspaceId: id },
      select: { id: true },
    });
    if (!owned) return fail("不存在", 404);

    await prisma.modelAsset.delete({ where: { id: modelId } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
