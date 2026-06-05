import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { VIDEO_ENGINES } from "@/lib/video-engines";
import { isOpenRouterConfigured } from "@/lib/openrouter";
import { STARTER_TEMPLATES } from "@/lib/creation-templates";
import { CreateClient } from "./create-client";

export const metadata = { title: "创作工坊 · OneClaw" };

const STARTER_TEMPLATE_PROPS = STARTER_TEMPLATES.map((t) => ({
  id: t.id,
  kind: "starter" as const,
  emoji: t.emoji,
  name: t.name,
  description: t.description,
  engine: t.engine,
  durationSec: t.durationSec,
  aspectRatio: t.aspectRatio,
  style: t.style,
  promptTemplate: t.promptTemplate,
  generateScript: t.generateScript,
  generateCover: t.generateCover,
  defaultProductId: null,
  defaultModelAssetId: null,
  defaultMaterialIds: [],
  isFavorite: false,
  usageCount: 0,
}));

const ENGINE_PROPS = VIDEO_ENGINES.map((e) => ({
  key: e.key,
  cn: e.cn,
  tagline: e.tagline,
  durations: e.durations,
  aspects: e.aspects,
  tags: e.tags,
  recommended: !!e.recommended,
  supportsImageInput: e.supportsImageInput,
  requiresImage: !!e.requiresImage,
  priceHint: `约 ¢${e.costCentsBySeconds(e.durations[0]!)} / ${e.durations[0]}s`,
}));

export default async function CreatePage() {
  const session = await auth();
  // 游客：用静态引擎 + 起步模板把页面渲染出来，可逛可填；
  // 识别链接 / 生成视频 / 存模板等动作再提示登录。
  if (!session?.user?.id) {
    return (
      <CreateClient
        isGuest
        workspaceId=""
        genReady={isOpenRouterConfigured()}
        engines={ENGINE_PROPS}
        products={[]}
        materials={[]}
        models={[]}
        starterTemplates={STARTER_TEMPLATE_PROPS}
        customTemplates={[]}
      />
    );
  }
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  const [products, materials, models, customTemplates] = await Promise.all([
    prisma.product.findMany({
      where: { workspaceId: workspace.id, status: { not: "ARCHIVED" } },
      orderBy: [{ status: "asc" }, { roiScore: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        emoji: true,
        priceCents: true,
        roiScore: true,
        status: true,
      },
    }),
    prisma.material.findMany({
      where: { workspaceId: workspace.id, type: { in: ["IMAGE", "VIDEO"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, url: true, originalName: true },
    }),
    prisma.modelAsset.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isFavorite: "desc" }, { usageCount: "desc" }],
      take: 20,
      select: {
        id: true,
        name: true,
        gender: true,
        style: true,
        avatarUrl: true,
        usageCount: true,
        isFavorite: true,
      },
    }),
    prisma.creationTemplate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isFavorite: "desc" }, { usageCount: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return (
    <CreateClient
      workspaceId={workspace.id}
      genReady={isOpenRouterConfigured()}
      engines={ENGINE_PROPS}
      products={products.map((p) => ({
        id: p.id,
        title: p.title,
        emoji: p.emoji,
        priceCents: p.priceCents,
        roiScore: p.roiScore,
        status: p.status,
      }))}
      materials={materials.map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        originalName: m.originalName,
      }))}
      models={models.map((m) => ({
        id: m.id,
        name: m.name,
        gender: m.gender,
        style: m.style,
        avatarUrl: m.avatarUrl,
        usageCount: m.usageCount,
        isFavorite: m.isFavorite,
      }))}
      starterTemplates={STARTER_TEMPLATE_PROPS}
      customTemplates={customTemplates.map((t) => ({
        id: t.id,
        kind: "custom" as const,
        emoji: t.emoji ?? "🎬",
        name: t.name,
        description: t.description ?? "",
        engine: t.engine,
        durationSec: t.durationSec,
        aspectRatio: t.aspectRatio as "9:16" | "16:9" | "1:1",
        style: t.style,
        promptTemplate: t.promptTemplate,
        generateScript: t.generateScript,
        generateCover: t.generateCover,
        defaultProductId: t.defaultProductId,
        defaultModelAssetId: t.defaultModelAssetId,
        defaultMaterialIds: t.defaultMaterialIds,
        isFavorite: t.isFavorite,
        usageCount: t.usageCount,
      }))}
    />
  );
}
