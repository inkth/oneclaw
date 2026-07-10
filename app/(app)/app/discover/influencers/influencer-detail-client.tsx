"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrendChart, type TrendSeries } from "../_components/TrendChart";
import { FavoriteButton } from "../_components/FavoriteButton";
import { fmt, fmtMoney, initial, fmtUnixDate, stringToGradient } from "../_components/format";
import {
  Award,
  ArrowLeft,
  ExternalLink,
  Users,
  Eye,
  DollarSign,
  Video,
  Play,
  Heart,
  Mail,
  Megaphone,
} from "lucide-react";

export type InfluencerDetail = {
  userId: string;
  uniqueId: string;
  nickName: string;
  region: string;
  avatar: string;
  category: string;
  gender: string;
  language: string;
  contactEmail: string;
  signature: string;
  ecScore: number;
  interactionRate: number;
  followers: number;
  followers30d: number;
  postVideoCnt: number;
  productCnt: number;
  totalSaleCnt: number;
  totalSaleGmv: number;
  totalViewsCnt: number;
  totalDiggCnt: number;
  videos: {
    videoId: string;
    uniqueId: string;
    cover: string;
    desc: string;
    isAd: boolean;
    views: number;
    digg: number;
    comments: number;
    shares: number;
    createTime: string;
    saleCnt: number;
    saleGmv: number;
  }[];
  trend: { dt: string; followers: number; newFollowers: number; saleCnt: number; gmv: number }[];
};

const FOLLOWER_SERIES: TrendSeries[] = [
  { key: "followers", label: "粉丝总数", kind: "area", axis: "left", color: "#6e56ff" },
  { key: "newFollowers", label: "日增粉", kind: "line", axis: "right", color: "#64748b" },
];

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

export function InfluencerDetailClient({
  influencer: i,
  fav,
}: {
  influencer: InfluencerDetail;
  fav: { workspaceId: string; isGuest: boolean; starred: boolean };
}) {
  const profileUrl = i.uniqueId ? `https://www.tiktok.com/@${i.uniqueId}` : "";

  return (
    <div className="space-y-6">
      <Link
        href="/app/discover/influencers"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" /> 返回达人榜
      </Link>

      <PageHeader
        title={<span className="line-clamp-2">{i.nickName}</span>}
        badge={<Badge tone="neutral">{i.region}</Badge>}
        description={
          <span className="text-xs">
            {i.uniqueId && <span className="font-mono">@{i.uniqueId}</span>}
            {i.category ? ` · ${i.category}` : ""}
          </span>
        }
        actions={
          <>
            <FavoriteButton
              kind="influencer"
              externalId={i.userId}
              region={i.region}
              workspaceId={fav.workspaceId}
              isGuest={fav.isGuest}
              initialStarred={fav.starred}
              snapshot={{
                name: i.nickName,
                cover: i.avatar,
                subtitle: i.uniqueId ? `@${i.uniqueId}${i.category ? ` · ${i.category}` : ""}` : i.category,
                metric: `${fmt(i.followers)} 粉丝`,
              }}
            />
            {profileUrl && (
              <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="primary" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" /> 访问 TikTok 主页
                </Button>
              </a>
            )}
          </>
        }
      />

      {/* Hero */}
      <Card className="grid gap-6 sm:grid-cols-[160px_1fr]">
        <Img
          src={i.avatar}
          seed={i.nickName}
          className="aspect-square w-full rounded-full object-cover bg-zinc-100"
        />
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            {i.ecScore > 0 && (
              <div>
                <div className="text-xs text-zinc-500">带货分</div>
                <div className="inline-flex items-center gap-1 text-2xl font-semibold tabular-nums text-brand-600">
                  <Award className="h-5 w-5" />
                  {i.ecScore.toFixed(2)}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-zinc-500">粉丝</div>
              <div className="text-2xl font-semibold tabular-nums">{fmt(i.followers)}</div>
              {i.followers30d > 0 && (
                <div className="mt-0.5 text-2xs text-emerald-600">近30天 +{fmt(i.followers30d)}</div>
              )}
            </div>
            {i.interactionRate > 0 && (
              <div>
                <div className="text-xs text-zinc-500">互动率</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {(i.interactionRate * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {i.category && <Badge tone="violet">{i.category}</Badge>}
            {i.gender && <Badge tone="neutral">{i.gender === "1" ? "男" : i.gender === "2" ? "女" : i.gender}</Badge>}
            {i.language && i.language !== "un" && <Badge tone="neutral">{i.language}</Badge>}
            {i.contactEmail && (
              <Badge tone="info" icon={<Mail className="h-3 w-3" />}>
                {i.contactEmail}
              </Badge>
            )}
          </div>

          {i.signature && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-600 line-clamp-3">
              {i.signature}
            </p>
          )}
        </div>
      </Card>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Users} label="粉丝" value={fmt(i.followers)} hint={i.followers30d > 0 ? `近30天 +${fmt(i.followers30d)}` : undefined} />
        <Stat icon={Eye} label="总播放" value={fmt(i.totalViewsCnt)} hint={`累计点赞 ${fmt(i.totalDiggCnt)}`} />
        <Stat icon={DollarSign} label="带货 GMV" value={fmtMoney(i.totalSaleGmv)} hint={`带货 ${fmt(i.totalSaleCnt)} 件`} />
        <Stat icon={Video} label="作品数" value={fmt(i.postVideoCnt)} hint={`带货商品 ${fmt(i.productCnt)}`} />
      </div>

      {/* 粉丝增长趋势 */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-medium text-zinc-900">粉丝增长趋势(近 14 天)</span>
        </div>
        <TrendChart data={i.trend} series={FOLLOWER_SERIES} empty="暂无粉丝趋势数据" />
      </Card>

      {/* 热门视频 */}
      {i.videos.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Video className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-zinc-900">热门作品</span>
            <span className="text-xs text-zinc-400">点击在 TikTok 打开</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {i.videos.map((v) => {
              const url = v.uniqueId
                ? `https://www.tiktok.com/@${v.uniqueId}/video/${v.videoId}`
                : "";
              const inner = (
                <>
                  <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-zinc-100">
                    <Img src={v.cover} seed={v.videoId} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="h-8 w-8 text-white drop-shadow" />
                    </div>
                    {v.isAd && (
                      <div className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-fuchsia-600/90 px-1.5 py-0.5 text-2xs text-white">
                        <Megaphone className="h-2.5 w-2.5" /> 广告
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs text-white tabular-nums">
                      {fmt(v.views)} 播放
                    </div>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-xs text-zinc-600">{v.desc || "—"}</div>
                  <div className="mt-0.5 flex items-center justify-between text-2xs text-zinc-400 tabular-nums">
                    <span>{fmtUnixDate(v.createTime)}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Heart className="h-2.5 w-2.5" /> {fmt(v.digg)}
                    </span>
                  </div>
                </>
              );
              return url ? (
                <a key={v.videoId} href={url} target="_blank" rel="noopener noreferrer" className="group block">
                  {inner}
                </a>
              ) : (
                <div key={v.videoId} className="group block">
                  {inner}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
