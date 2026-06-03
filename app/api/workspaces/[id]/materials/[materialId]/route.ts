import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; materialId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, materialId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const owned = await prisma.material.findFirst({
      where: { id: materialId, workspaceId: id },
      select: { id: true, storageKey: true },
    });
    if (!owned) return fail("不存在", 404);

    // TODO: 真正从 COS / Blob 删原始文件（当前只删 DB 行）
    await prisma.material.delete({ where: { id: materialId } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
