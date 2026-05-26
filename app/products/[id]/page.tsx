/**
 * /products/[id] — Product detail view aggregating:
 *   - detail (basic + windowed metrics)
 *   - top 带货达人
 *   - top 挂车视频
 *   - 销量趋势 (last ~10 days)
 */

import Link from 'next/link';
import {
  getProductDetail,
  getProductInfluencers,
  getProductVideos,
  getProductTrend,
  parseProductCovers,
} from '@/lib/echotik/client';
import type { Region } from '@/lib/echotik/types';

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ region?: string }>;
}) {
  const { id } = await params;
  const { region = 'US' } = await searchParams;
  const rg = region as Region;

  const [detail, influencers, videos, trend] = await Promise.all([
    getProductDetail(id, rg),
    getProductInfluencers(id, 1, 10),
    getProductVideos(id, 1, 10),
    getProductTrend(id),
  ]);

  if (!detail) {
    return (
      <main className="min-h-screen px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <Link href="/ranklist" className="text-sm text-zinc-500 hover:underline">← 返回榜单</Link>
          <p className="mt-6 text-red-600">未找到商品 {id}</p>
        </div>
      </main>
    );
  }

  const covers = parseProductCovers(detail.cover_url);
  const mainCover = covers[0]?.url;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <Link href={`/ranklist?region=${rg}`} className="text-sm text-zinc-500 hover:underline">
          ← 返回榜单
        </Link>

        {/* Header */}
        <section className="mt-4 flex gap-6 items-start">
          {mainCover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mainCover}
              alt={detail.product_name}
              className="w-40 h-40 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800"
            />
          )}
          <div className="flex-1">
            <div className="text-xs text-zinc-500 mb-1">{rg} · {id}</div>
            <h1 className="text-xl font-semibold leading-snug">{detail.product_name}</h1>
            <div className="mt-2 text-sm">
              <span className="font-medium text-lg">${detail.spu_avg_price}</span>
              <span className="text-zinc-500 ml-2">(${detail.min_price} – ${detail.max_price})</span>
              <span className="text-zinc-500 ml-4">
                佣金 {(detail.product_commission_rate * 100).toFixed(0)}%
              </span>
              <span className="text-zinc-500 ml-4">
                评分 {detail.product_rating ?? '—'} ({detail.review_count ?? 0} 评)
              </span>
            </div>
          </div>
        </section>

        {/* Windowed metrics */}
        <section className="mt-8 grid grid-cols-2 md:grid-cols-6 gap-2">
          <MetricCard label="销量 1d"  v={detail.total_sale_1d_cnt} />
          <MetricCard label="销量 7d"  v={detail.total_sale_7d_cnt} />
          <MetricCard label="销量 30d" v={detail.total_sale_30d_cnt} />
          <MetricCard label="GMV 1d"   v={detail.total_sale_gmv_1d_amt} money />
          <MetricCard label="GMV 7d"   v={detail.total_sale_gmv_7d_amt} money />
          <MetricCard label="GMV 30d"  v={detail.total_sale_gmv_30d_amt} money />
          <MetricCard label="视频 1d"  v={detail.total_video_1d_cnt} />
          <MetricCard label="视频 7d"  v={detail.total_video_7d_cnt} />
          <MetricCard label="视频 30d" v={detail.total_video_30d_cnt} />
          <MetricCard label="达人视频 1d"  v={(detail.total_ifl_video_1d_cnt as number)} />
          <MetricCard label="达人视频 7d"  v={(detail.total_ifl_video_7d_cnt as number)} />
          <MetricCard label="达人视频 30d" v={(detail.total_ifl_video_30d_cnt as number)} />
        </section>

        {/* Trend */}
        {trend && trend.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">销量趋势</h2>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-right">单日销量</th>
                    <th className="px-3 py-2 text-right">单日 GMV</th>
                    <th className="px-3 py-2 text-right">累计达人</th>
                    <th className="px-3 py-2 text-right">累计视频</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trend].sort((a, b) => b.dt.localeCompare(a.dt)).map(t => (
                    <tr key={t.dt} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="px-3 py-2">{t.dt}</td>
                      <td className="px-3 py-2 text-right">{t.total_sale_1d_cnt.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">${Math.round(t.total_sale_gmv_1d_amt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{t.total_ifl_cnt.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{t.total_video_cnt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Influencers */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            带货达人 ({influencers?.length ?? 0})
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {influencers?.map(inf => (
              <li
                key={inf.user_id}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inf.avatar} alt={inf.nick_name} className="w-10 h-10 rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{inf.nick_name}</div>
                  <div className="text-xs text-zinc-500">
                    {inf.total_followers_cnt.toLocaleString()} 粉 · {inf.category}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-medium">${Math.round(inf.per_product_ifl_gmv_amt).toLocaleString()}</div>
                  <div className="text-zinc-500">{inf.per_product_ifl_sale_cnt} 单</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Videos */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            挂车视频 ({videos?.length ?? 0})
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {videos?.map(v => (
              <li
                key={v.video_id}
                className="flex gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.reflow_cover} alt="" className="w-20 h-24 rounded object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs line-clamp-3 text-zinc-700 dark:text-zinc-300">{v.video_desc}</p>
                  <div className="mt-2 text-[11px] text-zinc-500 flex flex-wrap gap-x-3">
                    <span>👁 {v.total_views_cnt.toLocaleString()}</span>
                    <span>❤ {v.total_digg_cnt.toLocaleString()}</span>
                    <span>💬 {v.total_comments_cnt.toLocaleString()}</span>
                    <span>🛒 {v.total_video_sale_cnt} (${Math.round(v.total_video_sale_gmv_amt).toLocaleString()})</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, v, money }: { label: string; v?: number; money?: boolean }) {
  const display = v == null
    ? '—'
    : money
      ? '$' + Math.round(v).toLocaleString()
      : v.toLocaleString();
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm font-medium">{display}</div>
    </div>
  );
}
