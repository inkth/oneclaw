import Link from "next/link";
import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../../_components/regions";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";
import { InfluencerDetailClient, type InfluencerDetail } from "../influencer-detail-client";

export const metadata = { title: "达人详情 · OneClaw" };

type DTO = {
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
  totalSaleGmvCents: number;
  totalViewsCnt: number;
  totalDiggCnt: number;
  videos:
    | {
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
        saleGmvCents: number;
      }[]
    | null;
  trend:
    | { dt: string; followers: number; newFollowers: number; saleCnt: number; gmvCents: number }[]
    | null;
};

export default async function InfluencerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await params;
  const sp = await searchParams;
  const region = REGION_CODES.includes((sp.region ?? "") as Region) ? (sp.region as Region) : "US";

  const dto = await apiServer<{ influencer: DTO | null }>(
    `/discover/influencers/${userId}?region=${region}`,
  )
    .then((r) => r.influencer)
    .catch(() => null);

  if (!dto) {
    return (
      <div className="space-y-4">
        <Link href="/app/discover/influencers" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 返回达人榜
        </Link>
        <EmptyState
          icon={Users}
          title="达人暂不可用"
          description="该达人数据暂时取不到,或数据源不可用。请回到达人榜重试。"
        />
      </div>
    );
  }

  const influencer: InfluencerDetail = {
    userId: dto.userId,
    uniqueId: dto.uniqueId,
    nickName: dto.nickName,
    region: dto.region,
    avatar: dto.avatar,
    category: dto.category,
    gender: dto.gender,
    language: dto.language,
    contactEmail: dto.contactEmail,
    signature: dto.signature,
    ecScore: dto.ecScore,
    interactionRate: dto.interactionRate,
    followers: dto.followers,
    followers30d: dto.followers30d,
    postVideoCnt: dto.postVideoCnt,
    productCnt: dto.productCnt,
    totalSaleCnt: dto.totalSaleCnt,
    totalSaleGmv: dto.totalSaleGmvCents / 100,
    totalViewsCnt: dto.totalViewsCnt,
    totalDiggCnt: dto.totalDiggCnt,
    videos: (dto.videos ?? []).map((v) => ({
      videoId: v.videoId,
      uniqueId: v.uniqueId,
      cover: v.cover,
      desc: v.desc,
      isAd: v.isAd,
      views: v.views,
      digg: v.digg,
      comments: v.comments,
      shares: v.shares,
      createTime: v.createTime,
      saleCnt: v.saleCnt,
      saleGmv: v.saleGmvCents / 100,
    })),
    trend: (dto.trend ?? []).map((t) => ({
      dt: t.dt,
      followers: t.followers,
      newFollowers: t.newFollowers,
      saleCnt: t.saleCnt,
      gmv: t.gmvCents / 100,
    })),
  };

  return <InfluencerDetailClient influencer={influencer} />;
}
