import Link from 'next/link';
import { TrendingUp, Users, Video, DollarSign } from 'lucide-react';
import type { ProductListItem } from '@/lib/echotik/types';

interface ProductCardProps {
  product: ProductListItem;
  rank: number;
  region: string;
}

export function ProductCard({ product: p, rank, region }: ProductCardProps) {
  const score = calculateBeginnerScore(p);

  return (
    <Link
      href={`/products/${p.product_id}?region=${region}`}
      className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="text-lg font-mono text-zinc-300 dark:text-zinc-700 w-8 shrink-0 text-center">
          {String(rank).padStart(2, '0')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="text-sm font-medium line-clamp-2 leading-snug">
              {p.product_name}
            </h3>
            <ScoreBadge score={score} />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricRow icon={DollarSign} label="均价" value={`$${p.spu_avg_price}`} />
            <MetricRow icon={TrendingUp} label="销量" value={p.total_sale_cnt.toLocaleString()} />
            <MetricRow icon={Users} label="达人" value={p.total_ifl_cnt.toLocaleString()} />
            <MetricRow icon={Video} label="视频" value={p.total_video_cnt.toLocaleString()} />
          </div>

          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400">
            <span>GMV ${Math.round(p.total_sale_gmv_amt).toLocaleString()}</span>
            <span>佣金 {(p.product_commission_rate * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MetricRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
      <Icon size={12} />
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-800 dark:text-zinc-200 ml-auto">{value}</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (score >= 80) color = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  else if (score >= 60) color = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';

  return (
    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${color}`}>
      {score}分
    </span>
  );
}

function calculateBeginnerScore(p: ProductListItem): number {
  let score = 50;

  // Price sweet spot: $10-50 is ideal for beginners (low risk, good margin)
  if (p.spu_avg_price >= 10 && p.spu_avg_price <= 50) score += 15;
  else if (p.spu_avg_price >= 5 && p.spu_avg_price <= 100) score += 8;

  // Good sales volume indicates proven demand
  if (p.total_sale_cnt > 1000) score += 10;
  else if (p.total_sale_cnt > 100) score += 5;

  // Moderate influencer count (not too saturated, not too cold)
  if (p.total_ifl_cnt >= 5 && p.total_ifl_cnt <= 50) score += 10;
  else if (p.total_ifl_cnt > 50) score += 3;

  // Good commission rate makes influencer recruitment easier
  if (p.product_commission_rate >= 0.15) score += 10;
  else if (p.product_commission_rate >= 0.1) score += 5;

  // Video content exists (proven content model)
  if (p.total_video_cnt > 10) score += 5;

  return Math.min(99, Math.max(10, score));
}
