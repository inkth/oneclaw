import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(800).nullable().optional(),
  emoji: z.string().max(8).optional(),
  isFavorite: z.boolean().optional(),
  bumpUsage: z.boolean().optional(),
});

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, templateId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const owned = await prisma.creationTemplate.findFirst({
      where: { id: templateId, workspaceId: id },
      select: { id: true },
    });
    if (!owned) return fail("不存在", 404);

    const body = await req.json();
    const data = patchSchema.parse(body);

    const { bumpUsage, ...patch } = data;
    const template = await prisma.creationTemplate.update({
      where: { id: templateId },
      data: {
        ...patch,
        ...(bumpUsage ? { usageCount: { increment: 1 } } : {}),
      },
    });
    return ok({ template });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, templateId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const owned = await prisma.creationTemplate.findFirst({
      where: { id: templateId, workspaceId: id },
      select: { id: true },
    });
    if (!owned) return fail("不存在", 404);

    await prisma.creationTemplate.delete({ where: { id: templateId } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
