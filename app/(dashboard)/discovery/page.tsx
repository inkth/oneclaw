import Link from 'next/link';
import { getProductRanklist } from '@/lib/echotik/client';
import type {
  Region, RankType, RankField, ProductListItem,
} from '@/lib/echotik/types';
import { ProductCard } from './product-card';

const REGIONS: Region[] = ['US', 'GB', 'ID', 'TH', 'VN', 'MY'];
const RANK_TYPES: Array<{ v: RankType; label: string; desc: string }> = [
  { v: 1, label: '热销榜', desc: '销量最高的商品' },
  { v: 2, label: '飙升榜', desc: '增长最快的商品' },
  { v: 3, label: '新品榜', desc: '近期上架新品' },
];
const RANK_FIELDS: Array<{ v: RankField; label: string }> = [
  { v: 1, label: '按销量' },
  { v: 2, label: '按 GMV' },
  { v: 3, label: '按增长' },
];

export default async function DiscoveryPage({
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

  const currentRankType = RANK_TYPES.find(t => t.v === rank_type);

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">智能选品</h1>
        <p className="text-sm text-zinc-500 mt-1">
          TikTok Shop 实时商品榜单 · 数据来源 EchoTik · 共 {items.length} 个商品
        </p>
      </header>

      {/* Region Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-zinc-400 font-medium mr-1">地区</span>
        {REGIONS.map(r => (
          <FilterChip
            key={r}
            active={r === region}
            href={buildHref({ region: r, rank_type: String(rank_type), field: String(product_rank_field) })}
            label={r}
          />
        ))}
      </div>

      {/* Rank Type Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-zinc-400 font-medium mr-1">榜单</span>
        {RANK_TYPES.map(t => (
          <FilterChip
            key={t.v}
            active={t.v === rank_type}
            href={buildHref({ region, rank_type: String(t.v), field: String(product_rank_field) })}
            label={t.label}
          />
        ))}
        {currentRankType && (
          <span className="text-xs text-zinc-400 ml-2">{currentRankType.desc}</span>
        )}
      </div>

      {/* Rank Field Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs text-zinc-400 font-medium mr-1">排序</span>
        {RANK_FIELDS.map(f => (
          <FilterChip
            key={f.v}
            active={f.v === product_rank_field}
            href={buildHref({ region, rank_type: String(rank_type), field: String(f.v) })}
            label={f.label}
          />
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
          <div className="font-medium mb-1">加载失败</div>
          <code className="text-xs">{error}</code>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((p, i) => (
            <ProductCard key={p.product_id} product={p} rank={i + 1} region={region} />
          ))}
        </div>
      )}
    </div>
  );
}

function buildHref(params: Record<string, string>) {
  return `/discovery?${new URLSearchParams(params).toString()}`;
}

function FilterChip({
  active, href, label,
}: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-full px-3 py-1 text-xs font-medium bg-zinc-900 text-white dark:bg-white dark:text-black'
          : 'rounded-full px-3 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
      }
    >
      {label}
    </Link>
  );
}
