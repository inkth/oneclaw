/**
 * POST /api/ai/copilot
 *   { messages: ChatMessage[], context?: { route?, productId? } }
 *
 * Streams the AI 经营助手 reply as plain UTF-8 text tokens.
 */

import { z } from 'zod';
import { provider } from '@/lib/ai/provider';
import type { ChatMessage } from '@/lib/ai/provider';
import { COPILOT_SYSTEM } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }))
    .min(1)
    .max(20),
  context: z
    .object({ route: z.string().optional(), productId: z.string().optional() })
    .optional(),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid request';
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const system = parsed.context?.route
    ? `${COPILOT_SYSTEM}\n\n[当前用户所在页面: ${parsed.context.route}${
        parsed.context.productId ? ` · 商品 ${parsed.context.productId}` : ''
      }]`
    : COPILOT_SYSTEM;

  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...parsed.messages];

  try {
    const stream = await provider.chatStream(messages, { temperature: 0.7 });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI 服务异常';
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
