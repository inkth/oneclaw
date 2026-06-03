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
  status: z.enum(["CONNECTED", "PENDING", "DISCONNECTED", "ERROR"]).optional(),
  country: z.string().min(2).max(8).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shopId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, shopId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const owned = await prisma.shop.findFirst({
      where: { id: shopId, workspaceId: id },
      select: { id: true },
    });
    if (!owned) return fail("不存在", 404);

    const body = await req.json();
    const data = patchSchema.parse(body);
    const shop = await prisma.shop.update({ where: { id: shopId }, data });
    return ok({ shop });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; shopId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, shopId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const owned = await prisma.shop.findFirst({
      where: { id: shopId, workspaceId: id },
      select: { id: true },
    });
    if (!owned) return fail("不存在", 404);

    await prisma.shop.delete({ where: { id: shopId } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
