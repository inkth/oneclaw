import Link from "next/link";
import { getMe, apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../../_components/regions";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageSearch } from "lucide-react";
import { ProductDetailClient, type DetailProduct } from "../product-detail-client";

export const metadata = { title: "选品详情 · OneClaw" };

// 后端 DTO(金额 cents)。
type DetailDTO = {
  productId: string;
  name: string;
  region: string;
  avgPriceCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  commissionRate: number;
  totalSaleCnt: number;
  totalSaleGmvCents: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  coverUrls: string[] | null;
  importedProductId: string | null;
  interaction: { isStarred: boolean; tags: string[] } | null;
  rating: number;
  reviewCount: number;
  discount: string;
  freeShipping: boolean;
  description: string;
  windows: {
    sale7dCnt: number;
    sale30dCnt: number;
    sale90dCnt: number;
    gmv7dCents: number;
    gmv30dCents: number;
    video7dCnt: number;
    video30dCnt: number;
  } | null;
  influencers:
    | {
        userId: string;
        nickName: string;
        avatar: string;
        category: string;
        followers: number;
        perProductGmvCents: number;
        perProductSaleCnt: number;
      }[]
    | null;
  videos:
    | {
        videoId: string;
        cover: string;
        desc: string;
        playAddr: string;
        createTime: string;
        views: number;
        digg: number;
        comments: number;
        shares: number;
        saleCnt: number;
        saleGmvCents: number;
      }[]
    | null;
  trend: { dt: string; saleCnt: number; gmvCents: number }[] | null;
  score: {
    score: number;
    verdict: string;
    signals: { key: string; label: string; tone: string; value: string; hint: string }[];
  } | null;
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ externalId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { externalId } = await params;
  const sp = await searchParams;
  const region = REGION_CODES.includes((sp.region ?? "") as Region) ? (sp.region as Region) : "US";

  const me = await getMe();
  const workspace = me?.workspace ?? null;

  const path = workspace
    ? `/workspaces/${workspace.id}/discover/products/${externalId}?region=${region}`
    : `/discover/products/${externalId}?region=${region}`;

  const dto = await apiServer<{ product: DetailDTO }>(path)
    .then((r) => r.product)
    .catch(() => null);

  if (!dto) {
    return (
      <div className="space-y-4">
        <Link href="/app/discover/products" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 返回爆品榜
        </Link>
        <EmptyState
          icon={PackageSearch}
          title="商品暂不可用"
          description="该商品还没被加载过,或数据源暂时不可用。请回到爆品榜重新进入。"
        />
      </div>
    );
  }

  const product: DetailProduct = {
    productId: dto.productId,
    name: dto.name,
    region: dto.region,
    minPrice: dto.minPriceCents / 100,
    maxPrice: dto.maxPriceCents / 100,
    avgPrice: dto.avgPriceCents / 100,
    commissionRate: dto.commissionRate,
    totalSaleCnt: dto.totalSaleCnt,
    totalSaleGmv: dto.totalSaleGmvCents / 100,
    totalIflCnt: dto.totalIflCnt,
    totalVideoCnt: dto.totalVideoCnt,
    totalLiveCnt: 0,
    coverUrls: dto.coverUrls ?? [],
    rating: dto.rating,
    reviewCount: dto.reviewCount,
    discount: dto.discount,
    freeShipping: dto.freeShipping,
    description: dto.description,
    windows: dto.windows
      ? {
          sale7dCnt: dto.windows.sale7dCnt,
          sale30dCnt: dto.windows.sale30dCnt,
          sale90dCnt: dto.windows.sale90dCnt,
          gmv7d: dto.windows.gmv7dCents / 100,
          gmv30d: dto.windows.gmv30dCents / 100,
          video7dCnt: dto.windows.video7dCnt,
          video30dCnt: dto.windows.video30dCnt,
        }
      : null,
    influencers: (dto.influencers ?? []).map((i) => ({
      userId: i.userId,
      nickName: i.nickName,
      avatar: i.avatar,
      category: i.category,
      followers: i.followers,
      perProductGmv: i.perProductGmvCents / 100,
      perProductSaleCnt: i.perProductSaleCnt,
    })),
    videos: (dto.videos ?? []).map((v) => ({
      videoId: v.videoId,
      cover: v.cover,
      desc: v.desc,
      playAddr: v.playAddr,
      createTime: v.createTime,
      views: v.views,
      digg: v.digg,
      comments: v.comments,
      shares: v.shares,
      saleCnt: v.saleCnt,
      saleGmv: v.saleGmvCents / 100,
    })),
    trend: (dto.trend ?? []).map((t) => ({ dt: t.dt, saleCnt: t.saleCnt, gmv: t.gmvCents / 100 })),
    score: dto.score,
    importedProductId: dto.importedProductId,
    interaction: dto.interaction,
  };

  return (
    // key：弹窗内登录后 refresh 重传 props，强制重挂载以重置 useState(initial*)
    <ProductDetailClient
      key={workspace?.id ?? "guest"}
      product={product}
      workspaceId={workspace?.id ?? ""}
      isGuest={!workspace}
    />
  );
}
