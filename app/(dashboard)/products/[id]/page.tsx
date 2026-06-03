import Link from 'next/link';
import {
  getProductDetail,
  getProductInfluencers,
  getProductVideos,
  getProductTrend,
  parseProductCovers,
} from '@/lib/echotik/client';
import type { Region } from '@/lib/echotik/types';
import { ProfitCalculator } from './profit-calculator';
import { SalesTrendChart } from './sales-trend-chart';

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
      <div className="px-6 py-8">
        <Link href="/discovery" className="text-sm text-zinc-500 hover:underline">← 返回选品</Link>
        <p className="mt-6 text-red-600">未找到商品 {id}</p>
      </div>
    );
  }

  const covers = parseProductCovers(detail.cover_url);
  const mainCover = covers[0]?.url;

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <Link href={`/discovery?region=${rg}`} className="text-sm text-zinc-500 hover:underline">
        ← 返回选品
      </Link>

      {/* Header */}
      <section className="mt-4 flex gap-6 items-start">
        {mainCover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mainCover}
            alt={detail.product_name}
            className="w-36 h-36 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800"
          />
        )}
        <div className="flex-1">
          <div className="text-xs text-zinc-500 mb-1">{rg} · {id}</div>
          <h1 className="text-xl font-semibold leading-snug mb-2">{detail.product_name}</h1>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="font-semibold text-lg">${detail.spu_avg_price}</span>
            <span className="text-zinc-500">${detail.min_price} – ${detail.max_price}</span>
            <span className="text-zinc-500">佣金 {(detail.product_commission_rate * 100).toFixed(0)}%</span>
            <span className="text-zinc-500">评分 {detail.product_rating ?? '—'}</span>
          </div>
          <div className="flex gap-2 mt-3">
            <Link
              href={`/influencers?product_id=${id}&region=${rg}`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90"
            >
              找达人带货
            </Link>
            <button className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              收藏商品
            </button>
          </div>
        </div>
      </section>

      {/* Windowed Metrics */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-500 mb-3">核心数据</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          <MetricCard label="销量 1d" v={detail.total_sale_1d_cnt} />
          <MetricCard label="销量 7d" v={detail.total_sale_7d_cnt} />
          <MetricCard label="销量 30d" v={detail.total_sale_30d_cnt} />
          <MetricCard label="GMV 1d" v={detail.total_sale_gmv_1d_amt} money />
          <MetricCard label="GMV 7d" v={detail.total_sale_gmv_7d_amt} money />
          <MetricCard label="GMV 30d" v={detail.total_sale_gmv_30d_amt} money />
        </div>
      </section>

      {/* Sales Trend Chart */}
      {trend && trend.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-500 mb-3">销量趋势</h2>
          <SalesTrendChart data={trend} />
        </section>
      )}

      {/* Profit Calculator */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-500 mb-3">利润计算器</h2>
        <ProfitCalculator
          sellingPrice={detail.spu_avg_price}
          commissionRate={detail.product_commission_rate}
        />
      </section>

      {/* Influencers */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-500">
            带货达人 ({influencers?.length ?? 0})
          </h2>
          <Link
            href={`/influencers?product_id=${id}&region=${rg}`}
            className="text-xs text-zinc-500 hover:underline"
          >
            查看更多 →
          </Link>
        </div>
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
      <section className="mt-8 mb-12">
        <h2 className="text-sm font-semibold text-zinc-500 mb-3">
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
                  <span>{v.total_views_cnt.toLocaleString()} 播放</span>
                  <span>{v.total_digg_cnt.toLocaleString()} 赞</span>
                  <span>{v.total_comments_cnt.toLocaleString()} 评</span>
                  <span>{v.total_video_sale_cnt} 单 (${Math.round(v.total_video_sale_gmv_amt).toLocaleString()})</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
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
