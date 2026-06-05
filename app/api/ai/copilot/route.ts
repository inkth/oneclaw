/**
 * POST /api/ai/copilot
 *   { messages: {role:'user'|'assistant', content}[], context?: { route? } }
 *
 * 全局 AI 经营助手——流式纯文本返回。仅登录用户可用,经 OpenRouter
 * (lib/agents/llm) 调用,轻量对话不计入 Agent 任务配额。
 */

import { z } from "zod";
import { auth } from "@/auth";
import { chatStream } from "@/lib/agents/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

const COPILOT_SYSTEM = `你是 OneClaw 的 AI 经营助手,服务于做 TikTok Shop 跨境电商出海的中国卖家。
OneClaw 是 AI 驱动的一站式出海平台,核心是三个 Agent:
- 市场分析师(Market Analyst):扫描各区爆品、给选品评分与风险提示
- 创意总监(Creative Director):为商品批量生成 TikTok 风格短视频脚本与素材
- 品牌运营官(Brand Operator):多平台排期与运营执行

你的职责:
- 用简洁、口语化的中文回答,面向跨境新手,少堆术语,必要时举例。
- 聚焦 TikTok Shop 实操:选品、达人、短视频/直播带货、合规、物流、利润测算。
- 给可执行建议(分步骤、列要点),先结论后展开。
- 涉及具体数据或批量任务时,提示用户去对应模块:发现(/app/discover/products)、
  创作工坊(/app/create)、Agent(/app)。`;

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .max(20),
  context: z.object({ route: z.string().optional() }).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ ok: false, error: "请先登录" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid request";
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const system = parsed.context?.route
    ? `${COPILOT_SYSTEM}\n\n[当前用户所在页面: ${parsed.context.route}]`
    : COPILOT_SYSTEM;

  try {
    const stream = await chatStream({ system, messages: parsed.messages });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI 服务异常";
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
