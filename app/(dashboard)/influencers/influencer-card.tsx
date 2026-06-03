'use client';

import { useState } from 'react';
import { Users, Eye, Video, MessageSquare, Copy, Check } from 'lucide-react';
import type { ProductInfluencer } from '@/lib/echotik/types';

interface Props {
  influencer: ProductInfluencer;
  productId: string;
  region: string;
}

export function InfluencerCard({ influencer: inf, productId, region }: Props) {
  const [showTemplate, setShowTemplate] = useState(false);
  const [copied, setCopied] = useState(false);

  const engagementRate = inf.total_followers_cnt > 0
    ? ((inf.total_digg_cnt / inf.total_post_video_cnt) / inf.total_followers_cnt * 100).toFixed(1)
    : '—';

  const roi = inf.per_product_ifl_sale_cnt > 0
    ? (inf.per_product_ifl_gmv_amt / inf.per_product_ifl_sale_cnt).toFixed(2)
    : '—';

  const template = generateOutreachTemplate(inf);

  async function handleCopy() {
    await navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={inf.avatar} alt={inf.nick_name} className="w-14 h-14 rounded-full shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold truncate">{inf.nick_name}</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              {inf.category || '未分类'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-2">
            <MetricItem icon={Users} label="粉丝" value={formatNum(inf.total_followers_cnt)} />
            <MetricItem icon={Eye} label="总播放" value={formatNum(inf.total_views_cnt)} />
            <MetricItem icon={Video} label="视频数" value={inf.total_post_video_cnt.toLocaleString()} />
            <MetricItem icon={MessageSquare} label="互动率" value={`${engagementRate}%`} />
          </div>

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <div className="text-xs">
              <span className="text-zinc-400">该商品 GMV </span>
              <span className="font-semibold">${Math.round(inf.per_product_ifl_gmv_amt).toLocaleString()}</span>
            </div>
            <div className="text-xs">
              <span className="text-zinc-400">出单 </span>
              <span className="font-semibold">{inf.per_product_ifl_sale_cnt}</span>
            </div>
            <div className="text-xs">
              <span className="text-zinc-400">客单价 </span>
              <span className="font-semibold">${roi}</span>
            </div>
            <button
              onClick={() => setShowTemplate(!showTemplate)}
              className="ml-auto px-3 py-1 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90"
            >
              {showTemplate ? '收起' : '生成邀约'}
            </button>
          </div>
        </div>
      </div>

      {showTemplate && (
        <div className="mt-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">英文邀约模板</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <pre className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
            {template}
          </pre>
        </div>
      )}
    </div>
  );
}

function MetricItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={12} className="text-zinc-400" />
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-700 dark:text-zinc-300 ml-auto">{value}</span>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function generateOutreachTemplate(inf: ProductInfluencer): string {
  return `Hi ${inf.nick_name},

I hope this message finds you well! I came across your amazing content and I'm really impressed by your creativity and engagement with your audience.

I'm reaching out because I have a product that I believe would be a great fit for your content style and audience. I'd love to explore a collaboration opportunity with you.

Here's what I can offer:
- Free product samples for you to try
- Competitive commission rate on sales
- Long-term partnership potential

Would you be interested in learning more? I'd be happy to send over product details and discuss the specifics.

Looking forward to hearing from you!

Best regards`;
}
