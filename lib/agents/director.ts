import { z } from "zod";
import { prisma } from "@/lib/db";
import { chat, extractJson, type LLMUsage } from "./llm";
import {
  generateCover,
  submitVideoJob,
  FAL_IMAGE_MODEL,
  FAL_VIDEO_MODEL,
  isFalConfigured,
} from "@/lib/fal";
import type { VideoStyle } from "@prisma/client";

const directorOutputSchema = z.object({
  hookSummary: z.string(),
  videos: z
    .array(
      z.object({
        title: z.string().min(2).max(80),
        style: z.enum(["UNBOXING", "COMPARISON", "SCENE", "BEFORE_AFTER"]),
        durationSec: z.number().int().min(8).max(30).default(15),
        script: z.string().min(20).max(1500),
        coverPrompt: z.string().min(10).max(400),
        videoPrompt: z.string().min(10).max(600),
      }),
    )
    .length(4),
});

const SYSTEM = `你是 OneClaw 的"创意总监 Agent"，专门给跨境 TikTok / Reels 短视频写脚本和提示词。

任务：输入是一个产品，输出 4 套差异化的 9:16 短视频策划方案，分别对应：
1. UNBOXING（开箱）
2. COMPARISON（对比测评）
3. SCENE（生活场景）
4. BEFORE_AFTER（前后对比）

每条视频包含：
- 脚本（中英混排都可，要包含 hook + 3-4 个 beat + CTA）
- coverPrompt：英文，给文生图模型用，9:16 竖屏封面图描述
- videoPrompt：英文，给文生视频模型用，5 秒动态镜头描述（含运镜 / 节奏）

强制：
- **仅输出合法 JSON**，不要 markdown 代码块也不要解释
- 全部 4 个 style 必须各出现一次
- coverPrompt / videoPrompt 必须是英文，且突出产品视觉特征

JSON schema：
{
  "hookSummary": "一句话总结这 4 条短视频的差异化策略（中文，<60字）",
  "videos": [
    {
      "title": "Unboxing 风",
      "style": "UNBOXING",
      "durationSec": 15,
      "script": "0-2s hook ... 13-15s CTA",
      "coverPrompt": "9:16 vertical, cinematic close-up of ...",
      "videoPrompt": "5 second clip, handheld, slow zoom-in on ..."
    }
  ]
}`;

export type DirectorResult = {
  output: string;
  metadata: {
    videos: Array<{
      id: string;
      title: string;
      style: VideoStyle;
      thumbnailUrl: string | null;
      falRequestId: string | null;
    }>;
    productTitle: string | null;
  };
  usage: LLMUsage;
};

/**
 * 解析输入：支持 "for productId=cxxx" 或 "产品: <title>" 两种约定，
 * 若都没有就用整条 input 作为"产品描述"，并尝试找最近一个推荐产品挂上。
 */
async function resolveProduct(input: string, workspaceId: string) {
  // 1. 精确指定 productId
  const idMatch = input.match(/productId=([a-z0-9]+)/i);
  if (idMatch) {
    const p = await prisma.product.findFirst({
      where: { id: idMatch[1], workspaceId },
    });
    if (p) return { product: p, label: p.title };
  }

  // 2. 取工作台最近一个 RECOMMENDED 产品
  const top = await prisma.product.findFirst({
    where: { workspaceId, status: "RECOMMENDED" },
    orderBy: { roiScore: "desc" },
  });
  return { product: top, label: top?.title ?? input };
}

export async function runDirector(
  input: string,
  workspaceId: string,
): Promise<DirectorResult> {
  const { product, label } = await resolveProduct(input, workspaceId);

  const userPrompt = product
    ? [
        `产品：${product.title}`,
        `品类：${product.category}`,
        `售价：$${(product.priceCents / 100).toFixed(2)}`,
        `毛利：${product.marginPct}%`,
        product.note ? `卖点：${product.note}` : "",
        "",
        `用户需求：${input}`,
      ]
        .filter(Boolean)
        .join("\n")
    : `用户需求：${input}`;

  const { content, usage } = await chat({
    system: SYSTEM,
    user: userPrompt,
    json: true,
    maxTokens: 2400,
  });

  const raw = extractJson(content);
  const parsed = directorOutputSchema.parse(raw);

  const falReady = isFalConfigured();

  // 并行：4 个封面 + 4 个视频任务提交
  const coverUrls = await Promise.all(
    parsed.videos.map((v) =>
      falReady ? generateCover(v.coverPrompt) : Promise.resolve(null),
    ),
  );
  const videoSubmits = await Promise.all(
    parsed.videos.map((v) =>
      falReady ? submitVideoJob(v.videoPrompt) : Promise.resolve(null),
    ),
  );

  const created = await prisma.$transaction(
    parsed.videos.map((v, i) => {
      const sub = videoSubmits[i];
      return prisma.video.create({
        data: {
          workspaceId,
          productId: product?.id,
          title: v.title,
          style: v.style as VideoStyle,
          durationSec: v.durationSec,
          script: v.script,
          thumbnailUrl: coverUrls[i],
          falRequestId: sub?.requestId ?? null,
          falModel: sub?.model ?? (sub ? FAL_VIDEO_MODEL : null),
          processing: sub ? "GENERATING" : "PENDING",
        },
      });
    }),
  );

  const lines = [
    `🎬 已为「${label}」生成 4 套差异化短视频方案：`,
    "",
    ...parsed.videos.map((v, i) => {
      const tags: string[] = [];
      if (coverUrls[i]) tags.push("封面 ✓");
      else if (falReady) tags.push("封面 ✗");
      if (videoSubmits[i]) tags.push("视频生成中…");
      return (
        `${(i + 1).toString().padStart(2, "0")} · ${v.title} (${v.style}) · ${v.durationSec}s` +
        (tags.length ? ` · ${tags.join(" · ")}` : "")
      );
    }),
    "",
    `策略：${parsed.hookSummary}`,
    "",
    falReady
      ? `→ 视频还在 ${FAL_VIDEO_MODEL} 队列里跑，30s-5min 后到【短视频】页刷新即可。`
      : `→ FAL_KEY 未配置，本次仅生成脚本，封面/视频跳过。`,
  ];

  return {
    output: lines.join("\n"),
    metadata: {
      videos: created.map((c) => ({
        id: c.id,
        title: c.title,
        style: c.style,
        thumbnailUrl: c.thumbnailUrl,
        falRequestId: c.falRequestId,
      })),
      productTitle: product?.title ?? null,
    },
    usage,
  };
}

export { FAL_IMAGE_MODEL };
