import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { assertCanGenerateVideo } from "@/lib/quota";
import { getEngine } from "@/lib/video-engines";
import { submitVideoJob, generateCover, isFalConfigured } from "@/lib/fal";
import { chat } from "@/lib/agents/llm";
import type { VideoStyle, Prisma } from "@prisma/client";

export const maxDuration = 60;

const schema = z.object({
  engine: z.string().min(1),
  prompt: z.string().min(5).max(2000),
  title: z.string().min(1).max(120).optional(),
  style: z
    .enum(["UNBOXING", "COMPARISON", "SCENE", "BEFORE_AFTER"])
    .default("SCENE"),
  durationSec: z.number().int().min(3).max(30).optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  productId: z.string().optional(),
  modelAssetId: z.string().optional(),
  templateId: z.string().optional(), // 用了哪个模板（custom 才有 id；starter 不存）
  referenceMaterialIds: z.array(z.string()).max(6).default([]),
  generateScript: z.boolean().default(false),
  generateCover: z.boolean().default(true),
});

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    if (!isFalConfigured()) return fail("FAL_KEY 未配置", 503);

    const rl = await rateLimit({
      key: `video-create:${id}`,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail(`太频繁，请 ${rl.retryAfter}s 后再试`, 429);

    const videoQuota = await assertCanGenerateVideo(id);
    if (!videoQuota.ok) {
      return fail(videoQuota.reason, 402, { quota: videoQuota.quota });
    }

    const body = await req.json();
    const data = schema.parse(body);

    const engine = getEngine(data.engine);
    if (!engine) return fail(`不支持的引擎: ${data.engine}`, 400);

    const duration = data.durationSec ?? engine.durations[0];
    if (!engine.durations.includes(duration)) {
      return fail(
        `${engine.cn} 不支持 ${duration}s，仅支持 ${engine.durations.join("/")}s`,
        400,
      );
    }
    if (!engine.aspects.includes(data.aspectRatio)) {
      return fail(
        `${engine.cn} 不支持 ${data.aspectRatio}，仅支持 ${engine.aspects.join("/")}`,
        400,
      );
    }

    // 校验关联对象都属于此 workspace
    if (data.productId) {
      const p = await prisma.product.findFirst({
        where: { id: data.productId, workspaceId: id },
        select: { id: true },
      });
      if (!p) return fail("商品不存在", 404);
    }
    if (data.modelAssetId) {
      const m = await prisma.modelAsset.findFirst({
        where: { id: data.modelAssetId, workspaceId: id },
        select: { id: true },
      });
      if (!m) return fail("模特不存在", 404);
    }
    let firstImageMaterialUrl: string | null = null;
    if (data.referenceMaterialIds.length > 0) {
      const mats = await prisma.material.findMany({
        where: { id: { in: data.referenceMaterialIds }, workspaceId: id },
        orderBy: { createdAt: "asc" },
      });
      if (mats.length !== data.referenceMaterialIds.length) {
        return fail("部分素材不存在", 404);
      }
      // image-to-video 用素材列表里第一张图作为首帧
      firstImageMaterialUrl =
        mats.find((m) => m.type === "IMAGE" || m.type === "LOGO" || m.type === "WATERMARK")
          ?.url ?? null;
    }

    if (engine.supportsImageInput && !firstImageMaterialUrl && engine.key === "kling-i2v") {
      return fail("该引擎需要至少 1 张图片素材作为首帧", 400);
    }

    // 校验 templateId（只接受 custom 模板的 cuid，starter 模板 id 以 "starter:" 开头会被自动忽略）
    let resolvedTemplateId: string | null = null;
    if (data.templateId && !data.templateId.startsWith("starter:")) {
      const t = await prisma.creationTemplate.findFirst({
        where: { id: data.templateId, workspaceId: id },
        select: { id: true },
      });
      if (t) resolvedTemplateId = t.id;
    }

    // 先创建 PENDING 占位，立刻返回前端，让 after() 慢慢处理
    const placeholder = await prisma.video.create({
      data: {
        workspaceId: id,
        productId: data.productId ?? null,
        modelAssetId: data.modelAssetId ?? null,
        templateId: resolvedTemplateId,
        title: data.title ?? data.prompt.slice(0, 60),
        style: data.style as VideoStyle,
        durationSec: duration,
        aspectRatio: data.aspectRatio,
        prompt: data.prompt,
        engine: engine.key,
        falModel: engine.falModel,
        referenceMaterialIds: data.referenceMaterialIds,
        costCents: engine.costCentsBySeconds(duration),
        processing: "PENDING",
      },
    });

    after(async () => {
      try {
        await prisma.video.update({
          where: { id: placeholder.id },
          data: { processing: "GENERATING" },
        });

        // 1. 可选脚本生成（写回到 video.script）
        if (data.generateScript) {
          try {
            const { content } = await chat({
              system:
                "你是 OneClaw 创意总监。给定提示词，输出一条 9:16 短视频的中文脚本，含 hook + 3-4 个 beat + CTA。只输出脚本正文，不要解释。",
              user: data.prompt,
              maxTokens: 800,
            });
            await prisma.video.update({
              where: { id: placeholder.id },
              data: { script: content.trim() },
            });
          } catch (e) {
            console.warn("[create-video] script gen failed", e);
          }
        }

        // 2. 可选封面（fal flux）
        let coverUrl: string | null = null;
        if (data.generateCover) {
          try {
            coverUrl = await generateCover(
              `${data.prompt}, ${data.aspectRatio} vertical product showcase, photographic`,
            );
            if (coverUrl) {
              await prisma.video.update({
                where: { id: placeholder.id },
                data: { thumbnailUrl: coverUrl },
              });
            }
          } catch (e) {
            console.warn("[create-video] cover gen failed", e);
          }
        }

        // 3. 提交视频生成（支持 i2v 时用首张素材图）
        const sub = await submitVideoJob(data.prompt, {
          modelOverride: engine.falModel,
          duration,
          aspectRatio: data.aspectRatio,
          imageUrl:
            engine.supportsImageInput && firstImageMaterialUrl
              ? firstImageMaterialUrl
              : undefined,
        });
        if (!sub) {
          await prisma.video.update({
            where: { id: placeholder.id },
            data: {
              processing: "FAILED",
              errorMessage: "fal video submit failed",
            },
          });
          return;
        }
        await prisma.video.update({
          where: { id: placeholder.id },
          data: {
            falRequestId: sub.requestId,
            falModel: sub.model,
          },
        });

        // 计数 +1 if 用了模特
        if (data.modelAssetId) {
          await prisma.modelAsset.update({
            where: { id: data.modelAssetId },
            data: { usageCount: { increment: 1 } },
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await prisma.video.update({
          where: { id: placeholder.id },
          data: { processing: "FAILED", errorMessage: msg },
        });
      }
    });

    return ok({ video: placeholder }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}

// reference field used to suppress unused import warning
type _U = Prisma.PrismaPromise<unknown>;
const _u: _U | undefined = undefined;
void _u;
