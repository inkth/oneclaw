/**
 * GET /api/echotik/ranklist
 *   ?region=US&rank_type=1&product_rank_field=1&page_size=20&page_num=1&date=YYYY-MM-DD
 *
 * Returns the EchoTik product ranklist. Defaults: US, HOT, SALES, 20/page.
 */

import type { NextRequest } from 'next/server';
import { getProductRanklist } from '@/lib/echotik/client';
import type { Region, RankType, RankField } from '@/lib/echotik/types';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  try {
    const data = await getProductRanklist({
      region: (sp.get('region') ?? 'US') as Region,
      rank_type: Number(sp.get('rank_type') ?? 1) as RankType,
      product_rank_field: Number(sp.get('product_rank_field') ?? 1) as RankField,
      date: sp.get('date') ?? undefined,
      page_num: Number(sp.get('page_num') ?? 1),
      page_size: Number(sp.get('page_size') ?? 20),
      category_id: sp.get('category_id') ?? undefined,
      category_l2_id: sp.get('category_l2_id') ?? undefined,
      category_l3_id: sp.get('category_l3_id') ?? undefined,
    });
    return Response.json({ ok: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
