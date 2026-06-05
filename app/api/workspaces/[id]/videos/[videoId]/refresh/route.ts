import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { pollVideoStatus as falPollVideoStatus, isFalConfigured } from "@/lib/fal";
import { pollVideoStatus as orPollVideoStatus } from "@/lib/openrouter-video";
import { isOpenRouterConfigured } from "@/lib/openrouter";
import { getEngine } from "@/lib/video-engines";
import {
  rehostUrl,
  isStorageConfigured,
  deriveVideoPath,
  deriveThumbnailPath,
} from "@/lib/storage";

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function POST(
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
    });
    if (!video) return fail("视频不存在", 404);

    if (!video.falRequestId) {
      return ok({ video, hint: "本视频未关联生成任务" });
    }
    if (video.processing === "COMPLETED" || video.processing === "FAILED") {
      return ok({ video, hint: "已完成或失败，无需轮询" });
    }

    // 按引擎 provider 决定走 OpenRouter 还是 fal（注册表里没有的旧引擎按 fal 兜底）。
    const isOpenRouter = getEngine(video.engine ?? "")?.provider === "openrouter";
    const backendReady = isOpenRouter ? isOpenRouterConfigured() : isFalConfigured();
    if (!backendReady) {
      return fail("视频服务暂不可用，请稍后再试", 503);
    }

    const status = isOpenRouter
      ? await orPollVideoStatus(video.falRequestId)
      : await falPollVideoStatus(video.falRequestId, video.falModel ?? undefined);

    if (status.state === "COMPLETED") {
      // 尝试把 fal CDN 临时 URL 转存到持久存储（防 24-48h 失效）
      let finalVideoUrl = status.videoUrl;
      let finalThumbnailUrl = video.thumbnailUrl;
      if (isStorageConfigured()) {
        const rehostedVideo = await rehostUrl({
          sourceUrl: status.videoUrl,
          pathname: deriveVideoPath(id, video.id),
          contentType: "video/mp4",
        });
        if (rehostedVideo) finalVideoUrl = rehostedVideo;

        if (video.thumbnailUrl) {
          const rehostedThumb = await rehostUrl({
            sourceUrl: video.thumbnailUrl,
            pathname: deriveThumbnailPath(id, video.id),
            contentType: "image/jpeg",
          });
          if (rehostedThumb) finalThumbnailUrl = rehostedThumb;
        }
      }

      const updated = await prisma.video.update({
        where: { id: video.id },
        data: {
          videoUrl: finalVideoUrl,
          thumbnailUrl: finalThumbnailUrl,
          processing: "COMPLETED",
        },
      });
      return ok({ video: updated });
    }
    if (status.state === "FAILED") {
      const updated = await prisma.video.update({
        where: { id: video.id },
        data: { processing: "FAILED" },
      });
      return ok({ video: updated, error: status.error });
    }
    return ok({ video, state: status.state });
  } catch (err) {
    return handleError(err);
  }
}
