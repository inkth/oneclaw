/**
 * /ranklist — TikTok Shop hot/rising/new product board, server-rendered.
 *
 * Query params:
 *   ?region=US|GB|ID|TH|VN|MY
 *   &rank_type=1|2|3  (1=hot, 2=rising, 3=new)
 *   &field=1|2|3      (1=sales, 2=gmv, 3=growth)
 */

import Link from 'next/link';
import { getProductRanklist } from '@/lib/echotik/client';
import type {
  Region, RankType, RankField, ProductListItem,
} from '@/lib/echotik/types';

const REGIONS: Region[] = ['US', 'GB', 'ID', 'TH', 'VN', 'MY'];
const RANK_TYPES: Array<{ v: RankType; label: string }> = [
  { v: 1, label: 'Hot' },
  { v: 2, label: 'Rising' },
  { v: 3, label: 'New' },
];

export default async function RanklistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (sp.region ?? 'US') as Region;
  const rank_type = Number(sp.rank_type ?? 1) as RankType;
  const product_rank_field = Number(sp.field ?? 1) as RankField;

  let items: ProductListItem[] = [];
  let error: string | null = null;
  try {
    items = await getProductRanklist({
      region, rank_type, product_rank_field, page_size: 50,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">TikTok Shop 选品榜单</h1>
          <p className="text-sm text-zinc-500 mt-1">
            数据来源:EchoTik · 更新于 T-1 · 共 {items.length} 个商品
          </p>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {REGIONS.map(r => (
            <FilterChip
              key={r}
              active={r === region}
              href={{ region: r, rank_type: String(rank_type), field: String(product_rank_field) }}
              label={r}
            />
          ))}
          <span className="mx-2 text-zinc-300">|</span>
          {RANK_TYPES.map(t => (
            <FilterChip
              key={t.v}
              active={t.v === rank_type}
              href={{ region, rank_type: String(t.v), field: String(product_rank_field) }}
              label={t.label}
            />
          ))}
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            <div className="font-medium mb-1">加载失败</div>
            <code className="text-xs">{error}</code>
          </div>
        ) : (
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((p, i) => (
              <li key={p.product_id}>
                <Link
                  href={`/products/${p.product_id}?region=${region}`}
                  className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl font-mono text-zinc-400 w-10 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium line-clamp-2 mb-2">
                        {p.product_name}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-zinc-500">
                        <Stat label="销量" value={p.total_sale_cnt.toLocaleString()} />
                        <Stat label="GMV" value={'$' + Math.round(p.total_sale_gmv_amt).toLocaleString()} />
                        <Stat label="均价" value={'$' + p.spu_avg_price} />
                        <Stat label="达人数" value={p.total_ifl_cnt.toLocaleString()} />
                        <Stat label="视频数" value={p.total_video_cnt.toLocaleString()} />
                        <Stat label="佣金率" value={(p.product_commission_rate * 100).toFixed(0) + '%'} />
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-zinc-900 dark:text-zinc-100 font-medium">{value}</div>
    </div>
  );
}

function FilterChip({
  active, href, label,
}: { active: boolean; href: Record<string, string>; label: string }) {
  const qs = new URLSearchParams(href).toString();
  return (
    <Link
      href={`/ranklist?${qs}`}
      className={
        active
          ? 'rounded-full px-3 py-1 text-sm bg-black text-white dark:bg-white dark:text-black'
          : 'rounded-full px-3 py-1 text-sm bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
      }
    >
      {label}
    </Link>
  );
}
