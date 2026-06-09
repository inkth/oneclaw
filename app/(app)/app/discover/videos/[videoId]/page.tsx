import Link from "next/link";
import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../../_components/regions";
import { EmptyState } from "@/components/ui/EmptyState";
import { Clapperboard } from "lucide-react";
import { VideoDetailClient, type VideoDetail } from "../video-detail-client";

export const metadata = { title: "视频详情 · OneClaw" };

type DTO = {
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
  saleGmvCents: number;
  products:
    | { productId: string; name: string; cover: string; avgPriceCents: number; commissionRate: number; rating: number }[]
    | null;
};

export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { videoId } = await params;
  const sp = await searchParams;
  const region = REGION_CODES.includes((sp.region ?? "") as Region) ? (sp.region as Region) : "US";

  const dto = await apiServer<{ video: DTO | null }>(`/discover/videos/${videoId}?region=${region}`)
    .then((r) => r.video)
    .catch(() => null);

  if (!dto) {
    return (
      <div className="space-y-4">
        <Link href="/app/discover/videos" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 返回视频榜
        </Link>
        <EmptyState
          icon={Clapperboard}
          title="视频暂不可用"
          description="该视频数据暂时取不到,或数据源不可用。请回到视频榜重试。"
        />
      </div>
    );
  }

  const video: VideoDetail = {
    videoId: dto.videoId,
    userId: dto.userId,
    uniqueId: dto.uniqueId,
    region: dto.region,
    desc: dto.desc,
    cover: dto.cover,
    avatar: dto.avatar,
    duration: dto.duration,
    createTime: dto.createTime,
    isAd: dto.isAd,
    createdByAi: dto.createdByAi,
    views: dto.views,
    views7d: dto.views7d,
    views30d: dto.views30d,
    digg: dto.digg,
    comments: dto.comments,
    shares: dto.shares,
    favorites: dto.favorites,
    saleCnt: dto.saleCnt,
    saleGmv: dto.saleGmvCents / 100,
    products: (dto.products ?? []).map((p) => ({
      productId: p.productId,
      name: p.name,
      cover: p.cover,
      avgPrice: p.avgPriceCents / 100,
      commissionRate: p.commissionRate,
      rating: p.rating,
    })),
  };

  return <VideoDetailClient video={video} />;
}
