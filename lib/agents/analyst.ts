import { z } from "zod";
import { prisma } from "@/lib/db";
import { chat, extractJson, type LLMUsage } from "./llm";

const analystOutputSchema = z.object({
  summary: z.string(),
  products: z
    .array(
      z.object({
        title: z.string(),
        category: z.string(),
        emoji: z.string().max(8).optional().default("📦"),
        priceCents: z.number().int().nonnegative(),
        costCents: z.number().int().nonnegative(),
        marginPct: z.number().int().min(0).max(100),
        roiScore: z.number().int().min(0).max(100),
        monthlySales: z.number().int().nonnegative(),
        trendDelta: z.number().int().default(0),
        note: z.string().optional(),
        recommended: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(8),
});

const SYSTEM = `你是 OneClaw 的"市场分析师 Agent"。
你的任务是基于用户的需求描述，给出 3-5 个跨境电商高潜力选品建议。

强制要求：
- 必须用合法 JSON 输出，**绝对不要**有 markdown 代码块或额外解释
- 价格 / 成本必须是美元，转成"美分"整数（如 24.99 美元 → 2499）
- ROI 评分 0-100，越高越值得做
- trendDelta 是过去 14 天热度变化百分比（正/负整数）
- recommended=true 的产品最多 2 个

输出严格遵循这个 schema：
{
  "summary": "一段不超过 120 字的整体洞察",
  "products": [
    {
      "title": "商品名称（英文 + 关键参数，比如 'USB Portable Juicer Cup 380ml'）",
      "category": "中文品类（如 '厨房小电' '宠物用品'）",
      "emoji": "单个 emoji",
      "priceCents": 2499,
      "costCents": 620,
      "marginPct": 62,
      "roiScore": 94,
      "monthlySales": 12400,
      "trendDelta": 218,
      "note": "30 字以内：为什么值得做",
      "recommended": true
    }
  ]
}`;

export type AnalystResult = {
  output: string;
  metadata: {
    products: Array<{ id: string; title: string; roiScore: number }>;
    summary: string;
  };
  usage: LLMUsage;
};

export async function runAnalyst(
  input: string,
  workspaceId: string,
): Promise<AnalystResult> {
  const { content, usage } = await chat({
    system: SYSTEM,
    user: input,
    json: true,
    maxTokens: 1800,
  });

  const raw = extractJson(content);
  const parsed = analystOutputSchema.parse(raw);

  const created = await prisma.$transaction(
    parsed.products.map((p) =>
      prisma.product.create({
        data: {
          workspaceId,
          title: p.title,
          category: p.category,
          emoji: p.emoji,
          priceCents: p.priceCents,
          costCents: p.costCents,
          marginPct: p.marginPct,
          roiScore: p.roiScore,
          monthlySales: p.monthlySales,
          trendDelta: p.trendDelta,
          note: p.note,
          status: p.recommended ? "RECOMMENDED" : "EVALUATING",
        },
        select: { id: true, title: true, roiScore: true },
      }),
    ),
  );

  const lines = [
    `🔎 分析师扫描到 ${parsed.products.length} 个匹配项：`,
    "",
    ...parsed.products.map(
      (p, i) =>
        `${(i + 1).toString().padStart(2, "0")}. ${p.emoji ?? "📦"} ${p.title}` +
        ` · ROI ${p.roiScore} · 月销 ${p.monthlySales.toLocaleString()} · 毛利 ${p.marginPct}%` +
        (p.recommended ? " · ⭐ 推荐" : ""),
    ),
    "",
    `→ ${parsed.summary}`,
    "",
    `已自动写入【选品库】，可前往 /app/products 查看。`,
  ];

  return {
    output: lines.join("\n"),
    metadata: { products: created, summary: parsed.summary },
    usage,
  };
}
