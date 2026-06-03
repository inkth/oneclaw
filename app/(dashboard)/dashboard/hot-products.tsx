import Link from 'next/link';
import { getProductRanklist } from '@/lib/echotik/client';
import { RankType, RankField } from '@/lib/echotik/types';

/** Server child rendered inside a <Suspense> boundary so a slow/failed EchoTik
 *  call never blocks the dashboard shell. */
export async function HotProducts() {
  let products;
  try {
    products = await getProductRanklist({
      region: 'US',
      rank_type: RankType.HOT,
      product_rank_field: RankField.SALES,
      page_size: 6,
    });
  } catch {
    return (
      <p className="text-sm text-zinc-400">
        热门商品暂时加载失败,请前往
        <Link href="/discovery" className="text-orange-500 hover:underline"> 智能选品 </Link>
        查看。
      </p>
    );
  }

  if (!products?.length) {
    return <p className="text-sm text-zinc-400">暂无热门商品数据。</p>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {products.map((p, i) => (
        <Link
          key={p.product_id}
          href={`/products/${p.product_id}?region=US`}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-orange-500">#{i + 1}</span>
            <span className="text-[10px] text-zinc-400">US 热销</span>
          </div>
          <p className="text-xs font-medium line-clamp-2 leading-snug mb-2 min-h-[2rem]">
            {p.product_name}
          </p>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">${p.spu_avg_price}</span>
            <span>{p.total_sale_cnt.toLocaleString()} 销量</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function HotProductsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-24 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 animate-pulse"
        />
      ))}
    </div>
  );
}
