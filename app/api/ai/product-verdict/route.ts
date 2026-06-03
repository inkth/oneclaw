/**
 * POST /api/ai/product-verdict
 *   { productId: string, region?: Region }
 *
 * AI 选品诊断 — distills EchoTik metrics for a product into a beginner-facing
 * verdict. Non-streaming JSON. Reuses the cached EchoTik client directly.
 */

import { z } from 'zod';
import { provider } from '@/lib/ai/provider';
import { PRODUCT_VERDICT_SYSTEM } from '@/lib/ai/prompts';
import { getProductDetail, getProductTrend } from '@/lib/echotik/client';
import type { Region } from '@/lib/echotik/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({
  productId: z.string().min(1),
  region: z.enum(['US', 'GB', 'ID', 'TH', 'VN', 'MY']).default('US'),
});

interface Verdict {
  verdict: '推荐' | '谨慎' | '不推荐';
  score: number;
  reasons: string[];
  risks: string[];
  beginnerTip: string;
}

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid request';
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    const [detail, trend] = await Promise.all([
      getProductDetail(parsed.productId, parsed.region as Region),
      getProductTrend(parsed.productId).catch(() => null),
    ]);

    if (!detail) {
      return Response.json({ ok: false, error: '未找到该商品数据' }, { status: 404 });
    }

    const trendLine = trend?.length
      ? trend.map(t => `${t.dt}: 当日销量${t.total_sale_1d_cnt}, GMV$${Math.round(t.total_sale_gmv_1d_amt)}`).join('; ')
      : '无趋势数据';

    const facts = [
      `商品: ${detail.product_name}`,
      `地区: ${parsed.region}`,
      `售价: $${detail.spu_avg_price} (区间 $${detail.min_price}–$${detail.max_price})`,
      `佣金率: ${(detail.product_commission_rate * 100).toFixed(0)}%`,
      `评分: ${detail.product_rating ?? '无'} (${detail.review_count ?? 0} 条评价)`,
      `销量: 1d=${detail.total_sale_1d_cnt}, 7d=${detail.total_sale_7d_cnt}, 30d=${detail.total_sale_30d_cnt}`,
      `GMV: 1d=$${Math.round(detail.total_sale_gmv_1d_amt)}, 7d=$${Math.round(detail.total_sale_gmv_7d_amt)}, 30d=$${Math.round(detail.total_sale_gmv_30d_amt)}`,
      `带货达人数: ${detail.total_ifl_cnt} · 挂车视频数: ${detail.total_video_cnt} · 直播数: ${detail.total_live_cnt}`,
      `近期趋势: ${trendLine}`,
    ].join('\n');

    const raw = await provider.chat(
      [
        { role: 'system', content: PRODUCT_VERDICT_SYSTEM },
        { role: 'user', content: facts },
      ],
      { temperature: 0.4, jsonMode: true },
    );

    let verdict: Verdict;
    try {
      verdict = JSON.parse(raw) as Verdict;
    } catch {
      return Response.json({ ok: false, error: 'AI 返回格式异常' }, { status: 502 });
    }

    return Response.json({ ok: true, data: verdict });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI 服务异常';
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
