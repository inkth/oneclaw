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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, videoId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const video = await prisma.video.findFirst({
      where: { id: videoId, workspaceId: id },
      include: {
        product: { select: { id: true, title: true, emoji: true, status: true } },
        modelAsset: { select: { id: true, name: true, avatarUrl: true, kind: true, gender: true, style: true } },
        template: { select: { id: true, name: true, emoji: true } },
      },
    });
    if (!video) return fail("不存在", 404);

    // 把 referenceMaterialIds 解析成完整素材对象
    const materials =
      video.referenceMaterialIds.length > 0
        ? await prisma.material.findMany({
            where: { id: { in: video.referenceMaterialIds }, workspaceId: id },
            select: {
              id: true,
              type: true,
              originalName: true,
              url: true,
              contentType: true,
              sizeBytes: true,
            },
          })
        : [];

    return ok({ video: { ...video, materials } });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, videoId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const exists = await prisma.video.findFirst({
      where: { id: videoId, workspaceId: id },
      select: { id: true },
    });
    if (!exists) return fail("不存在", 404);

    await prisma.video.delete({ where: { id: videoId } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
