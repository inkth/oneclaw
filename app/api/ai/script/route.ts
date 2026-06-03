/**
 * POST /api/ai/script
 *   { productId: string, region?: Region, format?: 'short_video' | 'live_talking_points' }
 *
 * AI 内容脚本 — generates a TikTok带货 short-video script (or live talking
 * points) from product data, using top挂车视频 as style reference. Streams text.
 */

import { z } from 'zod';
import { provider } from '@/lib/ai/provider';
import { SCRIPT_SYSTEM } from '@/lib/ai/prompts';
import { getProductDetail, getProductVideos } from '@/lib/echotik/client';
import type { Region } from '@/lib/echotik/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({
  productId: z.string().min(1),
  region: z.enum(['US', 'GB', 'ID', 'TH', 'VN', 'MY']).default('US'),
  format: z.enum(['short_video', 'live_talking_points']).default('short_video'),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid request';
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    const [detail, videos] = await Promise.all([
      getProductDetail(parsed.productId, parsed.region as Region),
      getProductVideos(parsed.productId, 1, 5).catch(() => null),
    ]);

    if (!detail) {
      return Response.json({ ok: false, error: '未找到该商品数据' }, { status: 404 });
    }

    const refs = videos?.length
      ? videos
          .filter(v => v.video_desc)
          .slice(0, 5)
          .map(v => `- (${v.total_views_cnt.toLocaleString()} 播放) ${v.video_desc}`)
          .join('\n')
      : '无参考视频';

    const facts = [
      `商品: ${detail.product_name}`,
      `售价: $${detail.spu_avg_price}`,
      `地区: ${parsed.region}`,
      `评分: ${detail.product_rating ?? '无'}`,
      detail.desc_detail ? `卖点描述: ${detail.desc_detail.slice(0, 500)}` : null,
      `输出形式: ${parsed.format === 'live_talking_points' ? '直播带货话术要点' : 'TikTok 带货短视频脚本'}`,
      `热门挂车视频文案参考:\n${refs}`,
    ]
      .filter(Boolean)
      .join('\n');

    const stream = await provider.chatStream(
      [
        { role: 'system', content: SCRIPT_SYSTEM },
        { role: 'user', content: facts },
      ],
      { temperature: 0.9 },
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
