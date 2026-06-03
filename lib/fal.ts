import { fal } from "@fal-ai/client";

let configured = false;

export function ensureFalConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY 未配置");
  fal.config({ credentials: key });
  configured = true;
}

export function isFalConfigured() {
  return !!process.env.FAL_KEY;
}

export { fal };

export const FAL_IMAGE_MODEL =
  process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";
export const FAL_VIDEO_MODEL =
  process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v1/standard/text-to-video";

/**
 * 同步生成一张图（适合封面：快，~1-3s）
 * 返回 CDN URL。
 */
export async function generateCover(prompt: string): Promise<string | null> {
  ensureFalConfigured();
  try {
    const result = await fal.subscribe(FAL_IMAGE_MODEL, {
      input: {
        prompt,
        image_size: "portrait_16_9", // 9:16 close enough; flux schnell 接受预设
        num_images: 1,
        num_inference_steps: 4,
      },
      logs: false,
    });
    const data = result.data as { images?: Array<{ url: string }> };
    return data.images?.[0]?.url ?? null;
  } catch (e) {
    console.error("[fal] cover gen failed", e);
    return null;
  }
}

/**
 * 提交视频生成任务到 fal 队列，立刻返回 request_id。
 * 真正完成需要 ~30s-5min，调用方应轮询 pollVideoStatus。
 *
 * 没传 modelOverride 时使用默认 FAL_VIDEO_MODEL。
 */
export async function submitVideoJob(
  prompt: string,
  opts?: {
    modelOverride?: string;
    duration?: number;
    aspectRatio?: "9:16" | "16:9" | "1:1";
    imageUrl?: string; // 部分模型支持 image-to-video
  },
): Promise<{ requestId: string; model: string } | null> {
  ensureFalConfigured();
  const model = opts?.modelOverride ?? FAL_VIDEO_MODEL;
  const input: Record<string, unknown> = {
    prompt,
    duration: String(opts?.duration ?? 5),
    aspect_ratio: opts?.aspectRatio ?? "9:16",
  };
  if (opts?.imageUrl) input.image_url = opts.imageUrl;
  try {
    const { request_id } = await fal.queue.submit(model, { input });
    return { requestId: request_id, model };
  } catch (e) {
    console.error("[fal] video submit failed", e);
    return null;
  }
}

export type VideoJobStatus =
  | { state: "IN_QUEUE" }
  | { state: "IN_PROGRESS" }
  | { state: "COMPLETED"; videoUrl: string }
  | { state: "FAILED"; error: string };

export async function pollVideoStatus(
  requestId: string,
  modelOverride?: string,
): Promise<VideoJobStatus> {
  ensureFalConfigured();
  const model = modelOverride ?? FAL_VIDEO_MODEL;
  try {
    const status = (await fal.queue.status(model, {
      requestId,
      logs: false,
    })) as { status: string };

    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(model, { requestId });
      const data = result.data as { video?: { url: string } };
      const url = data.video?.url;
      if (!url) return { state: "FAILED", error: "no video url in result" };
      return { state: "COMPLETED", videoUrl: url };
    }

    if (status.status === "IN_PROGRESS") return { state: "IN_PROGRESS" };
    if (status.status === "IN_QUEUE") return { state: "IN_QUEUE" };
    return { state: "FAILED", error: `unexpected status: ${status.status}` };
  } catch (e) {
    return {
      state: "FAILED",
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}
