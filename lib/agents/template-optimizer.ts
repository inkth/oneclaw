/**
 * 模板优化师 Agent：
 *   1. 聚合工作台所有 CreationTemplate + 关联 Video 的成功率 / 播放 / 赞 / GMV
 *   2. 喂给 LLM，输出 3 类建议：top performers / improvements / new proposals
 *   3. 新模板提案必须用合法的 engine key（VIDEO_ENGINES.key），避免幻觉
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { VIDEO_ENGINES } from "@/lib/video-engines";
import { chat, extractJson, type LLMUsage } from "./llm";

const VIDEO_STYLES = ["UNBOXING", "COMPARISON", "SCENE", "BEFORE_AFTER"] as const;

const outputSchema = z.object({
  summary: z.string().max(300),
  topPerformers: z
    .array(
      z.object({
        templateId: z.string(),
        score: z.number().int().min(0).max(100),
        reason: z.string().max(200),
      }),
    )
    .max(5),
  improvements: z
    .array(
      z.object({
        templateId: z.string(),
        issue: z.string().max(200),
        suggestedPrompt: z.string().min(10).max(2000),
        rationale: z.string().max(200).optional(),
      }),
    )
    .max(5),
  newProposals: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        emoji: z.string().max(8),
        engine: z.string(),
        durationSec: z.number().int().min(3).max(30),
        aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
        style: z.enum(VIDEO_STYLES),
        promptTemplate: z.string().min(20).max(2000),
        rationale: z.string().max(200),
      }),
    )
    .max(4),
});

export type OptimizerOutput = z.infer<typeof outputSchema>;

export type OptimizerResult = {
  output: string;
  metadata: OptimizerOutput & {
    source: "template-optimizer";
    templatesAnalyzed: number;
    videosAnalyzed: number;
  };
  usage: LLMUsage;
};

type TemplateStat = {
  id: string;
  name: string;
  engine: string;
  durationSec: number;
  aspectRatio: string;
  style: string;
  promptTemplate: string;
  usageCount: number;
  isFavorite: boolean;
  videos: number;
  successRate: number; // 0..1
  avgViews: number;
  avgLikes: number;
  totalRevenueCents: number;
};

async function collectStats(workspaceId: string): Promise<TemplateStat[]> {
  const templates = await prisma.creationTemplate.findMany({
    where: { workspaceId },
    include: {
      videos: {
        select: {
          processing: true,
          views: true,
          likes: true,
          revenueCents: true,
        },
      },
    },
  });
  return templates.map((t) => {
    const total = t.videos.length;
    const ok = t.videos.filter((v) => v.processing === "COMPLETED").length;
    const sumViews = t.videos.reduce((s, v) => s + v.views, 0);
    const sumLikes = t.videos.reduce((s, v) => s + v.likes, 0);
    const sumRev = t.videos.reduce((s, v) => s + v.revenueCents, 0);
    return {
      id: t.id,
      name: t.name,
      engine: t.engine,
      durationSec: t.durationSec,
      aspectRatio: t.aspectRatio,
      style: t.style,
      promptTemplate: t.promptTemplate,
      usageCount: t.usageCount,
      isFavorite: t.isFavorite,
      videos: total,
      successRate: total > 0 ? ok / total : 0,
      avgViews: total > 0 ? Math.round(sumViews / total) : 0,
      avgLikes: total > 0 ? Math.round(sumLikes / total) : 0,
      totalRevenueCents: sumRev,
    };
  });
}

async function collectRecentVideoStats(workspaceId: string) {
  // 没绑 template 的"裸"视频也参考，给 LLM 看真实数据
  const videos = await prisma.video.findMany({
    where: { workspaceId, engine: { not: null } },
    select: {
      engine: true,
      durationSec: true,
      aspectRatio: true,
      style: true,
      processing: true,
      views: true,
      likes: true,
      revenueCents: true,
      prompt: true,
      templateId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // 按 engine 汇总
  const byEngine = new Map<
    string,
    { count: number; ok: number; views: number; likes: number }
  >();
  for (const v of videos) {
    if (!v.engine) continue;
    const e = byEngine.get(v.engine) ?? { count: 0, ok: 0, views: 0, likes: 0 };
    e.count += 1;
    if (v.processing === "COMPLETED") e.ok += 1;
    e.views += v.views;
    e.likes += v.likes;
    byEngine.set(v.engine, e);
  }
  return {
    totalVideos: videos.length,
    engineBreakdown: Array.from(byEngine.entries()).map(([engine, s]) => ({
      engine,
      count: s.count,
      successRate: s.count > 0 ? s.ok / s.count : 0,
      avgViews: s.count > 0 ? Math.round(s.views / s.count) : 0,
      avgLikes: s.count > 0 ? Math.round(s.likes / s.count) : 0,
    })),
  };
}

function buildFacts(
  stats: TemplateStat[],
  videoSummary: Awaited<ReturnType<typeof collectRecentVideoStats>>,
): string {
  const validEngines = VIDEO_ENGINES.map(
    (e) =>
      `  - ${e.key}: ${e.cn} (${e.tags.join("/")}, ${e.durations.join("|")}s, 比例 ${e.aspects.join("/")}, ${e.supportsImageInput ? "支持 i2v" : "仅 t2v"})`,
  ).join("\n");

  const templatesBlock =
    stats.length > 0
      ? stats
          .map(
            (s, i) =>
              [
                `${i + 1}. id=${s.id}  ${s.isFavorite ? "⭐" : ""} ${s.name}`,
                `   engine=${s.engine}  ${s.durationSec}s  ${s.aspectRatio}  style=${s.style}`,
                `   prompt: "${s.promptTemplate.slice(0, 240)}${s.promptTemplate.length > 240 ? "…" : ""}"`,
                `   usage=${s.usageCount}  videos=${s.videos}  successRate=${(s.successRate * 100).toFixed(0)}%`,
                `   avgViews=${s.avgViews}  avgLikes=${s.avgLikes}  totalGMV=¢${s.totalRevenueCents}`,
              ].join("\n"),
          )
          .join("\n\n")
      : "（当前工作台还没有自建模板）";

  const engineBlock =
    videoSummary.engineBreakdown.length > 0
      ? videoSummary.engineBreakdown
          .map(
            (e) =>
              `  - ${e.engine}: ${e.count} 次, 成功率 ${(e.successRate * 100).toFixed(0)}%, 均播放 ${e.avgViews}, 均赞 ${e.avgLikes}`,
          )
          .join("\n")
      : "  （还没有任何视频生成历史）";

  return [
    "【当前自建模板】",
    templatesBlock,
    "",
    "【近 50 条视频按引擎汇总】",
    engineBlock,
    "",
    "【可用引擎 key（你的提案只能用以下 key，别幻觉）】",
    validEngines,
  ].join("\n");
}

const SYSTEM = `你是 OneClaw 的"创作模板优化师"，负责把工作台里历史使用过的模板和视频成绩分析一遍，给出 3 类可执行建议。

**严格要求：**
- 仅输出 JSON（无 markdown 包裹、无解释文字）
- newProposals[].engine 必须是用户给的"可用引擎 key"中的一个
- newProposals[].style 必须是 UNBOXING/COMPARISON/SCENE/BEFORE_AFTER 之一
- 所有 templateId 必须来自用户给的模板列表
- 字数限制：summary < 200 字；每条 reason / issue / rationale < 100 字

输出 JSON schema：
{
  "summary": "整体观察一句话",
  "topPerformers": [
    { "templateId": "cmpxxx", "score": 0-100, "reason": "为什么效率高（结合数据）" }
  ],
  "improvements": [
    {
      "templateId": "cmpxxx",
      "issue": "现有 prompt 的具体问题（短）",
      "suggestedPrompt": "重写后的完整 prompt（可直接落库）",
      "rationale": "为什么这么改（短）"
    }
  ],
  "newProposals": [
    {
      "name": "模板名（< 30 字）",
      "emoji": "1 个 emoji",
      "engine": "kling-standard / kling-pro / minimax-hailuo / luma-dream / kling-i2v",
      "durationSec": 5,
      "aspectRatio": "9:16",
      "style": "SCENE",
      "promptTemplate": "完整可执行 prompt",
      "rationale": "为什么这个空白点值得填"
    }
  ]
}

要求：
- topPerformers 1-3 条（如果数据不足，可以 0 条）
- improvements 1-3 条
- newProposals 1-3 条
- 改进建议要**具体**，比如"加 CTA"、"放慢节奏"、"指定光线"，别空话
- 新模板要**填补**现有模板覆盖不到的场景，不要重复`;

export async function runTemplateOptimizer(
  workspaceId: string,
): Promise<OptimizerResult> {
  const stats = await collectStats(workspaceId);
  const videoSummary = await collectRecentVideoStats(workspaceId);
  const facts = buildFacts(stats, videoSummary);

  const { content, usage } = await chat({
    system: SYSTEM,
    user: facts,
    json: true,
    maxTokens: 3000,
  });
  const raw = extractJson(content);
  const parsed = outputSchema.parse(raw);

  // 二次校验：engine key 必须合法；templateId 必须存在
  const validEngineKeys = new Set(VIDEO_ENGINES.map((e) => e.key));
  const tplIds = new Set(stats.map((s) => s.id));
  parsed.newProposals = parsed.newProposals.filter((p) =>
    validEngineKeys.has(p.engine),
  );
  parsed.topPerformers = parsed.topPerformers.filter((t) => tplIds.has(t.templateId));
  parsed.improvements = parsed.improvements.filter((t) => tplIds.has(t.templateId));

  const lines = [
    `🧪 模板优化分析（${stats.length} 个模板 · ${videoSummary.totalVideos} 条历史视频）`,
    "",
    `📌 ${parsed.summary}`,
    "",
    parsed.topPerformers.length > 0
      ? "⭐ 高效模板："
      : "⭐ 高效模板：暂无足够数据",
    ...parsed.topPerformers.map(
      (t) =>
        `  · [${t.score}/100] ${stats.find((s) => s.id === t.templateId)?.name ?? t.templateId} — ${t.reason}`,
    ),
    "",
    parsed.improvements.length > 0
      ? "🔧 优化建议："
      : "🔧 优化建议：暂无",
    ...parsed.improvements.map(
      (i) =>
        `  · ${stats.find((s) => s.id === i.templateId)?.name ?? i.templateId}：${i.issue}`,
    ),
    "",
    parsed.newProposals.length > 0
      ? "✨ 新模板提案："
      : "✨ 新模板提案：暂无",
    ...parsed.newProposals.map((p, i) => `  ${i + 1}. ${p.emoji} ${p.name} (${p.engine}) — ${p.rationale}`),
  ];

  return {
    output: lines.join("\n"),
    metadata: {
      source: "template-optimizer",
      templatesAnalyzed: stats.length,
      videosAnalyzed: videoSummary.totalVideos,
      ...parsed,
    },
    usage,
  };
}
