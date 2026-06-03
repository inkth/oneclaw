/**
 * POST /api/ai/outreach
 *   { influencer: {...}, product?: {...}, lang?: 'en' | 'zh' }
 *
 * AI 邀约文案 — personalized influencer outreach DM. Streams plain text.
 */

import { z } from 'zod';
import { provider } from '@/lib/ai/provider';
import { OUTREACH_SYSTEM } from '@/lib/ai/prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({
  influencer: z.object({
    nick_name: z.string(),
    category: z.string().optional(),
    total_followers_cnt: z.number().optional(),
    per_product_ifl_gmv_amt: z.number().optional(),
    per_product_ifl_sale_cnt: z.number().optional(),
  }),
  product: z
    .object({
      name: z.string().optional(),
      commissionRate: z.number().optional(),
      price: z.number().optional(),
    })
    .optional(),
  lang: z.enum(['en', 'zh']).default('en'),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid request';
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const { influencer: inf, product, lang } = parsed;
  const facts = [
    `达人昵称: ${inf.nick_name}`,
    inf.category ? `内容领域: ${inf.category}` : null,
    inf.total_followers_cnt != null ? `粉丝量: ${inf.total_followers_cnt}` : null,
    inf.per_product_ifl_sale_cnt != null ? `该达人为同类商品带货出单: ${inf.per_product_ifl_sale_cnt}` : null,
    inf.per_product_ifl_gmv_amt != null ? `带货 GMV: $${Math.round(inf.per_product_ifl_gmv_amt)}` : null,
    product?.name ? `推广商品: ${product.name}` : null,
    product?.commissionRate != null ? `佣金率: ${(product.commissionRate * 100).toFixed(0)}%` : null,
    product?.price != null ? `售价: $${product.price}` : null,
    `语言: ${lang === 'zh' ? '中文' : '英文'}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const stream = await provider.chatStream(
      [
        { role: 'system', content: OUTREACH_SYSTEM },
        { role: 'user', content: facts },
      ],
      { temperature: 0.8 },
    );
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
