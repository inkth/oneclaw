import { z } from "zod";
import { prisma } from "@/lib/db";
import { chat, extractJson, type LLMUsage } from "./llm";

const operatorOutputSchema = z.object({
  weekStartingISODate: z.string(),
  rationale: z.string(),
  schedule: z.array(
    z.object({
      platform: z.enum(["TikTok", "Instagram", "YouTube"]),
      day: z.string(),
      timeLocal: z.string(),
      timezone: z.string(),
      videoTitle: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
});

const SYSTEM = `你是 OneClaw 的"品牌运营官 Agent"，负责跨境短视频的多平台发布排期。

给定工作台里现有的视频清单 + 用户的运营要求，输出本周三个平台的发布日历。

平台节奏参考：
- TikTok：每周 3-5 条，最佳时段欧美 EST 18:00-22:00
- Instagram Reels：每周 2-3 条，最佳时段 EST 11:00-13:00 或 19:00-21:00
- YouTube Shorts：每周 1-2 条，最佳时段 EST 17:00-19:00 或周末白天

强制：
- 仅输出 JSON
- weekStartingISODate 是本周一 ISO 日期（YYYY-MM-DD）
- 排期总数 6-10 条，三平台都要有
- 避免同一天三平台同时发同一条视频

JSON schema：
{
  "weekStartingISODate": "2026-05-25",
  "rationale": "一句话总结排期策略（中文，<60字）",
  "schedule": [
    {
      "platform": "TikTok",
      "day": "Mon",
      "timeLocal": "20:30",
      "timezone": "EST",
      "videoTitle": "Unboxing 风（如果有对应视频则填，否则可省略）",
      "notes": "可选：本条的运营提示"
    }
  ]
}`;

export type OperatorResult = {
  output: string;
  metadata: {
    weekStartingISODate: string;
    schedule: unknown[];
  };
  usage: LLMUsage;
};

export async function runOperator(
  input: string,
  workspaceId: string,
): Promise<OperatorResult> {
  const videos = await prisma.video.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { title: true, style: true, durationSec: true },
  });

  const videoList = videos.length
    ? videos
        .map((v, i) => `${i + 1}. ${v.title} (${v.style}, ${v.durationSec}s)`)
        .join("\n")
    : "（工作台暂无视频，可先泛设标题）";

  const userPrompt = [
    `当前视频清单：`,
    videoList,
    "",
    `用户要求：${input}`,
  ].join("\n");

  const { content, usage } = await chat({
    system: SYSTEM,
    user: userPrompt,
    json: true,
    maxTokens: 1800,
  });

  const raw = extractJson(content);
  const parsed = operatorOutputSchema.parse(raw);

  const lines = [
    `🌐 已生成 ${parsed.weekStartingISODate} 这周的发布排期：`,
    "",
    ...parsed.schedule.map(
      (s, i) =>
        `${(i + 1).toString().padStart(2, "0")} · ${s.platform} · ${s.day} ${s.timeLocal} ${s.timezone}` +
        (s.videoTitle ? ` · "${s.videoTitle}"` : "") +
        (s.notes ? `\n      ${s.notes}` : ""),
    ),
    "",
    `策略：${parsed.rationale}`,
  ];

  return {
    output: lines.join("\n"),
    metadata: {
      weekStartingISODate: parsed.weekStartingISODate,
      schedule: parsed.schedule,
    },
    usage,
  };
}
