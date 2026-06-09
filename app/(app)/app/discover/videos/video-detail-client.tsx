"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { fmt, fmtMoney, fmtDuration, fmtUnixDate, initial, stringToGradient } from "../_components/format";
import {
  ArrowLeft,
  ExternalLink,
  Play,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ShoppingBag,
  DollarSign,
  Star,
  Megaphone,
  Sparkles,
} from "lucide-react";

export type VideoDetail = {
  videoId: string;
  userId: string;
  uniqueId: string;
  region: string;
  desc: string;
  cover: string;
  avatar: string;
  duration: number;
  createTime: string;
  isAd: boolean;
  createdByAi: boolean;
  views: number;
  views7d: number;
  views30d: number;
  digg: number;
  comments: number;
  shares: number;
  favorites: number;
  saleCnt: number;
  saleGmv: number;
  products: {
    productId: string;
    name: string;
    cover: string;
    avgPrice: number;
    commissionRate: number;
    rating: number;
  }[];
};

function Img({ src, seed, className }: { src: string; seed: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center text-white font-semibold ${className}`}
        style={{ background: stringToGradient(seed) }}
      >
        {initial(seed)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} loading="lazy" onError={() => setFailed(true)} />;
}

export function VideoDetailClient({ video: v }: { video: VideoDetail }) {
  const tiktokUrl = v.uniqueId ? `https://www.tiktok.com/@${v.uniqueId}/video/${v.videoId}` : "";

  return (
    <div className="space-y-6">
      <Link
        href="/app/discover/videos"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> 返回视频榜
      </Link>

      <PageHeader
        title={<span className="line-clamp-2">{v.desc || "带货视频"}</span>}
        badge={<Badge tone="neutral">{v.region}</Badge>}
        description={
          <span className="text-xs">
            {v.uniqueId && <span className="font-mono">@{v.uniqueId}</span>}
            {` · ${fmtDuration(v.duration)} · ${fmtUnixDate(v.createTime)}`}
          </span>
        }
        actions={
          tiktokUrl ? (
            <a href={tiktokUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="primary" size="sm">
                <ExternalLink className="h-3.5 w-3.5" /> 在 TikTok 打开
              </Button>
            </a>
          ) : undefined
        }
      />

      {/* Hero:封面 + 创作者 + 关键数据 */}
      <Card className="grid gap-6 sm:grid-cols-[260px_1fr]">
        <a
          href={tiktokUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block aspect-[9/16] overflow-hidden rounded-xl bg-zinc-100"
        >
          <Img src={v.cover} seed={v.desc || v.videoId} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/15 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm">
              <Play className="h-3 w-3 fill-zinc-900" /> 在 TikTok 查看
            </span>
          </div>
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs text-white">
            <Play className="h-2.5 w-2.5 fill-white" /> {fmtDuration(v.duration)}
          </span>
        </a>

        <div className="space-y-4">
          {/* 创作者 → 达人详情 */}
          <Link
            href={`/app/discover/influencers/${v.userId}?region=${v.region}`}
            className="group inline-flex items-center gap-2.5"
          >
            <Img src={v.avatar} seed={v.uniqueId || "u"} className="h-11 w-11 rounded-full object-cover bg-zinc-100" />
            <div>
              <div className="text-sm font-medium text-zinc-900 group-hover:text-brand-600">
                @{v.uniqueId || "—"}
              </div>
              <div className="text-2xs text-zinc-400">查看达人详情 →</div>
            </div>
          </Link>

          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="text-xs text-zinc-500">播放量</div>
              <div className="text-2xl font-semibold tabular-nums">{fmt(v.views)}</div>
            </div>
            {v.saleGmv > 0 && (
              <div>
                <div className="text-xs text-zinc-500">带货 GMV</div>
                <div className="text-2xl font-semibold tabular-nums text-emerald-700">{fmtMoney(v.saleGmv)}</div>
              </div>
            )}
            {v.saleCnt > 0 && (
              <div>
                <div className="text-xs text-zinc-500">带货销量</div>
                <div className="text-2xl font-semibold tabular-nums">{fmt(v.saleCnt)}</div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {v.isAd && (
              <Badge tone="fuchsia" icon={<Megaphone className="h-3 w-3" />}>广告</Badge>
            )}
            {v.createdByAi && (
              <Badge tone="info" icon={<Sparkles className="h-3 w-3" />}>AI 生成</Badge>
            )}
          </div>

          {v.desc && <p className="text-sm leading-relaxed text-zinc-600 line-clamp-4">{v.desc}</p>}
        </div>
      </Card>

      {/* 互动指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Eye} label="播放" value={fmt(v.views)} hint={v.views7d > 0 ? `近7天 +${fmt(v.views7d)}` : undefined} />
        <Stat icon={Heart} label="点赞" value={fmt(v.digg)} />
        <Stat icon={MessageCircle} label="评论" value={fmt(v.comments)} />
        <Stat icon={Share2} label="分享" value={fmt(v.shares)} hint={v.favorites > 0 ? `收藏 ${fmt(v.favorites)}` : undefined} />
      </div>

      {/* 带货数据 */}
      {(v.saleCnt > 0 || v.saleGmv > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <Stat icon={ShoppingBag} label="带货销量" value={fmt(v.saleCnt)} hint="本视频累计成交件数" />
          <Stat icon={DollarSign} label="带货 GMV" value={fmtMoney(v.saleGmv)} hint="本视频累计成交额" />
        </div>
      )}

      {/* 视频带货商品 */}
      {v.products.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-zinc-900">视频带货商品</span>
            <span className="text-xs text-zinc-400">点击进入选品详情</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {v.products.map((p) => (
              <Link
                key={p.productId}
                href={`/app/discover/products/${p.productId}?region=${v.region}`}
                className="group block"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
                  <Img src={p.cover} seed={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  {p.commissionRate > 0 && (
                    <div className="absolute bottom-1 right-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-2xs text-white tabular-nums">
                      佣金 {(p.commissionRate * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
                <div className="mt-1.5 line-clamp-2 text-xs text-zinc-600 group-hover:text-brand-600">{p.name || "—"}</div>
                <div className="mt-0.5 flex items-center justify-between text-2xs text-zinc-400 tabular-nums">
                  <span className="font-medium text-zinc-700">${p.avgPrice.toFixed(2)}</span>
                  {p.rating > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600">
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                      {p.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* 兜底:无带货商品 */}
      {v.products.length === 0 && (
        <Card>
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Bookmark className="h-4 w-4 text-zinc-400" />
            该视频暂无关联带货商品(纯内容/品牌视频)。
          </div>
        </Card>
      )}
    </div>
  );
}
