/**
 * GET /api/echotik/products/[id]
 *   ?region=US
 *   &include=detail,influencers,videos,trend   (default: all four)
 *
 * Aggregates EchoTik detail + related influencers + related videos + trend
 * into one response, fired in parallel.
 */

import type { NextRequest } from 'next/server';
import {
  getProductDetail,
  getProductInfluencers,
  getProductVideos,
  getProductTrend,
} from '@/lib/echotik/client';
import type { Region } from '@/lib/echotik/types';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  const region = (sp.get('region') ?? 'US') as Region;
  const include = new Set((sp.get('include') ?? 'detail,influencers,videos,trend').split(','));

  try {
    const [detail, influencers, videos, trend] = await Promise.all([
      include.has('detail')      ? getProductDetail(id, region)         : null,
      include.has('influencers') ? getProductInfluencers(id, 1, 10)     : null,
      include.has('videos')      ? getProductVideos(id, 1, 10)          : null,
      include.has('trend')       ? getProductTrend(id)                  : null,
    ]);

    return Response.json({
      ok: true,
      data: { detail, influencers, videos, trend },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
