import Link from 'next/link';
import { getProductInfluencers, getProductDetail } from '@/lib/echotik/client';
import type { Region, ProductInfluencer } from '@/lib/echotik/types';
import { InfluencerCard } from './influencer-card';

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const productId = sp.product_id;
  const region = (sp.region ?? 'US') as Region;

  let influencers: ProductInfluencer[] = [];
  let productName: string | null = null;
  let error: string | null = null;

  if (productId) {
    try {
      const [infList, detail] = await Promise.all([
        getProductInfluencers(productId, 1, 10),
        getProductDetail(productId, region),
      ]);
      influencers = infList ?? [];
      productName = detail?.product_name ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">达人合作</h1>
        <p className="text-sm text-zinc-500 mt-1">
          寻找合适的 TikTok 达人为你的商品带货
        </p>
      </header>

      {!productId ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-8 text-center">
          <div className="text-4xl mb-4">🎯</div>
          <h2 className="text-lg font-semibold mb-2">从选品开始找达人</h2>
          <p className="text-sm text-zinc-500 mb-4 max-w-md mx-auto">
            先在智能选品中找到你感兴趣的商品，然后点击「找达人带货」来查看该商品的达人数据
          </p>
          <Link
            href="/discovery"
            className="inline-flex px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90"
          >
            前往选品 →
          </Link>
        </div>
      ) : (
        <>
          {productName && (
            <div className="mb-6 rounded-lg bg-zinc-100 dark:bg-zinc-900 px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-500">当前商品</span>
                <p className="text-sm font-medium line-clamp-1">{productName}</p>
              </div>
              <Link
                href={`/products/${productId}?region=${region}`}
                className="text-xs text-zinc-500 hover:underline"
              >
                查看详情 →
              </Link>
            </div>
          )}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
              <code className="text-xs">{error}</code>
            </div>
          ) : influencers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              暂无该商品的达人数据
            </div>
          ) : (
            <div className="space-y-3">
              {influencers.map(inf => (
                <InfluencerCard key={inf.user_id} influencer={inf} productId={productId} region={region} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
