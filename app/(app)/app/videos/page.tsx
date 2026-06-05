import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { VideosClient } from "./videos-client";

export const metadata = { title: "短视频 · OneClaw" };

export default async function VideosPage() {
  // 游客也能看（空态）；动手的动作再提示登录
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  const videos = workspace
    ? await prisma.video.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        include: { product: { select: { title: true, emoji: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">短视频</h1>
        <p className="mt-1 text-sm text-zinc-500">
          创意总监为每个选品生成的差异化短视频，封面与视频实时生成。
        </p>
      </div>

      <VideosClient
        workspaceId={workspace?.id ?? ""}
        initialVideos={videos.map((v) => ({
          id: v.id,
          title: v.title,
          style: v.style,
          durationSec: v.durationSec,
          thumbnailUrl: v.thumbnailUrl,
          videoUrl: v.videoUrl,
          script: v.script,
          processing: v.processing,
          views: v.views,
          likes: v.likes,
          productTitle: v.product?.title ?? null,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
