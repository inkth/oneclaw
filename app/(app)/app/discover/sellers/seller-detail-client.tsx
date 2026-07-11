"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrendChart } from "../_components/TrendChart";
import { FavoriteButton } from "../_components/FavoriteButton";
import { fmt, fmtMoney, initial, stringToGradient } from "../_components/format";
import {
  Store,
  Star,
  ArrowLeft,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Users,
  Video,
  Package,
} from "lucide-react";

export type SellerDetail = {
  sellerId: string;
  sellerName: string;
  region: string;
  cover: string;
  sellerLink: string;
  rating: number;
  categories: string[];
  avgPrice: number;
  totalProductCnt: number;
  totalSaleCnt: number;
  totalSaleGmv: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  totalLiveCnt: number;
  windows: { sale7dCnt: number; sale30dCnt: number; gmv7d: number; gmv30d: number } | null;
  products: {
    productId: string;
    name: string;
    cover: string;
    avgPrice: number;
    commissionRate: number;
    rating: number;
  }[];
  trend: { dt: string; saleCnt: number; gmv: number }[];
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

export function SellerDetailClient({
  seller: s,
  fav,
}: {
  seller: SellerDetail;
  fav: { workspaceId: string; isGuest: boolean; starred: boolean };
}) {
  return (
    <div className="space-y-6">
      <Link
        href="/app/discover/sellers"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" /> 返回店铺榜
      </Link>

      <PageHeader
        title={<span className="line-clamp-2">{s.sellerName}</span>}
        badge={<Badge tone="neutral">{s.region}</Badge>}
        description={
          s.categories.length > 0 ? (
            <span className="text-xs">{s.categories.join(" / ")}</span>
          ) : (
            <span className="font-mono text-xs">{s.sellerId}</span>
          )
        }
        actions={
          <>
            <FavoriteButton
              kind="seller"
              externalId={s.sellerId}
              region={s.region}
              workspaceId={fav.workspaceId}
              isGuest={fav.isGuest}
              initialStarred={fav.starred}
              snapshot={{
                name: s.sellerName,
                cover: s.cover,
                subtitle: s.categories.length > 0 ? s.categories.join(" / ") : s.region,
                metric: s.totalSaleGmv > 0 ? `${fmtMoney(s.totalSaleGmv)} GMV` : "",
              }}
            />
            {s.sellerLink && (
              <a href={s.sellerLink} target="_blank" rel="noopener noreferrer">
                <Button variant="primary" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" /> 访问 TikTok 店铺
                </Button>
              </a>
            )}
          </>
        }
      />

      {/* Hero */}
      <Card className="grid gap-6 sm:grid-cols-[160px_1fr]">
        <Img
          src={s.cover}
          seed={s.sellerName}
          className="aspect-square w-full rounded-xl object-cover bg-zinc-100"
        />
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            {s.rating > 0 && (
              <div>
                <div className="text-xs text-zinc-500">店铺评分</div>
                <div className="inline-flex items-center gap-1 text-2xl font-semibold tabular-nums">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  {s.rating.toFixed(1)}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-zinc-500">商品均价</div>
              <div className="text-2xl font-semibold tabular-nums">${s.avgPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">在售商品</div>
              <div className="text-2xl font-semibold tabular-nums">{fmt(s.totalProductCnt)}</div>
            </div>
          </div>
          {s.categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.categories.map((c) => (
                <Badge key={c} tone="violet" icon={<Store className="h-3 w-3" />}>
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="总销量"
          value={fmt(s.totalSaleCnt)}
          hint={s.windows ? `近 7 天 ${fmt(s.windows.sale7dCnt)} · 近 30 天 ${fmt(s.windows.sale30dCnt)}` : undefined}
        />
        <Stat
          icon={DollarSign}
          label="总 GMV"
          value={fmtMoney(s.totalSaleGmv)}
          hint={s.windows ? `近 7 天 ${fmtMoney(s.windows.gmv7d)} · 近 30 天 ${fmtMoney(s.windows.gmv30d)}` : undefined}
        />
        <Stat icon={Users} label="合作达人" value={fmt(s.totalIflCnt)} hint="累计带货达人数" />
        <Stat icon={Video} label="带货视频" value={fmt(s.totalVideoCnt)} hint={`直播 ${fmt(s.totalLiveCnt)} 场`} />
      </div>

      {/* 趋势图 */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-medium text-zinc-900">销量 / GMV 趋势（近 14 天）</span>
        </div>
        <TrendChart data={s.trend} />
      </Card>

      {/* 店铺热销商品 */}
      {s.products.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-zinc-900">店铺热销商品</span>
            <span className="text-xs text-zinc-400">点击进入选品详情</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {s.products.map((p) => (
              <Link
                key={p.productId}
                href={`/app/discover/products/${p.productId}?region=${s.region}`}
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
                <div className="mt-1.5 line-clamp-2 text-xs text-zinc-600 group-hover:text-brand-600">
                  {p.name || "—"}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-2xs text-zinc-400 tabular-nums">
                  <span className="font-medium text-zinc-900">${p.avgPrice.toFixed(2)}</span>
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
    </div>
  );
}
