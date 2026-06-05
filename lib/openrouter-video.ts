import { isOpenRouterConfigured } from "./openrouter";

/**
 * OpenRouter 视频生成客户端。
 * 异步：POST /api/v1/videos 立刻拿 job id，再轮询 GET /api/v1/videos/:id。
 * 完成后视频 URL 落在 unsigned_urls[]。
 *
 * 复用与 LLM 相同的 OPENROUTER_API_KEY，无需额外凭证。
 */

const VIDEOS_ENDPOINT = "https://openrouter.ai/api/v1/videos";

export { isOpenRouterConfigured };

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.AUTH_URL ?? "https://oneclaw.ai",
    "X-Title": "OneClaw",
  };
}

/** 与 lib/fal.ts 的 VideoJobStatus 保持同构，方便上层统一处理。 */
export type VideoJobStatus =
  | { state: "IN_QUEUE" }
  | { state: "IN_PROGRESS" }
  | { state: "COMPLETED"; videoUrl: string }
  | { state: "FAILED"; error: string };

/**
 * 提交视频生成，立刻返回 job id（落到 Video.falRequestId）。
 * 真正完成 ~30s-几分钟，调用方轮询 pollVideoStatus。
 */
export async function submitVideoJob(
  prompt: string,
  opts: {
    model: string;
    duration?: number;
    aspectRatio?: "9:16" | "16:9" | "1:1";
    imageUrl?: string; // image-to-video：作为首帧
  },
): Promise<{ requestId: string; model: string } | null> {
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt,
    aspect_ratio: opts.aspectRatio ?? "9:16",
  };
  if (opts.duration) body.duration = opts.duration;
  if (opts.imageUrl) {
    body.frame_images = [
      { type: "image_url", image_url: { url: opts.imageUrl }, frame_type: "first_frame" },
    ];
  }
  try {
    const res = await fetch(VIDEOS_ENDPOINT, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[openrouter] video submit failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { id?: string };
    if (!data.id) return null;
    return { requestId: data.id, model: opts.model };
  } catch (e) {
    console.error("[openrouter] video submit error", e);
    return null;
  }
}

export async function pollVideoStatus(jobId: string): Promise<VideoJobStatus> {
  try {
    const res = await fetch(`${VIDEOS_ENDPOINT}/${jobId}`, { headers: authHeaders() });
    if (!res.ok) {
      return { state: "FAILED", error: `poll http ${res.status}` };
    }
    const data = (await res.json()) as {
      status: string;
      unsigned_urls?: string[];
      error?: unknown;
    };
    switch (data.status) {
      case "completed": {
        const url = data.unsigned_urls?.[0];
        if (!url) return { state: "FAILED", error: "completed but no video url" };
        return { state: "COMPLETED", videoUrl: url };
      }
      case "failed":
      case "cancelled":
      case "expired":
        return {
          state: "FAILED",
          error: typeof data.error === "string" ? data.error : data.status,
        };
      case "pending":
        return { state: "IN_QUEUE" };
      case "in_progress":
      default:
        return { state: "IN_PROGRESS" };
    }
  } catch (e) {
    return { state: "FAILED", error: e instanceof Error ? e.message : "unknown" };
  }
}
