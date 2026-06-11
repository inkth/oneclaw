import Link from "next/link";
import { apiServer, getMe } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../../_components/regions";
import { EmptyState } from "@/components/ui/EmptyState";
import { Store } from "lucide-react";
import { SellerDetailClient, type SellerDetail } from "../seller-detail-client";

export const metadata = { title: "店铺详情 · OneClaw" };

type DTO = {
  sellerId: string;
  sellerName: string;
  region: string;
  cover: string;
  sellerLink: string;
  rating: number;
  categories: string[] | null;
  avgPriceCents: number;
  totalProductCnt: number;
  totalSaleCnt: number;
  totalSaleGmvCents: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  totalLiveCnt: number;
  windows: { sale7dCnt: number; sale30dCnt: number; gmv7dCents: number; gmv30dCents: number } | null;
  products:
    | {
        productId: string;
        name: string;
        cover: string;
        avgPriceCents: number;
        commissionRate: number;
        rating: number;
      }[]
    | null;
  trend: { dt: string; saleCnt: number; gmvCents: number }[] | null;
};

export default async function SellerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sellerId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { sellerId } = await params;
  const sp = await searchParams;
  const region = REGION_CODES.includes((sp.region ?? "") as Region) ? (sp.region as Region) : "US";

  const dto = await apiServer<{ seller: DTO | null }>(
    `/discover/sellers/${sellerId}?region=${region}`,
  )
    .then((r) => r.seller)
    .catch(() => null);

  if (!dto) {
    return (
      <div className="space-y-4">
        <Link href="/app/discover/sellers" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← 返回店铺榜
        </Link>
        <EmptyState
          icon={Store}
          title="店铺暂不可用"
          description="该店铺数据暂时取不到,或数据源不可用。请回到店铺榜重试。"
        />
      </div>
    );
  }

  const seller: SellerDetail = {
    sellerId: dto.sellerId,
    sellerName: dto.sellerName,
    region: dto.region,
    cover: dto.cover,
    sellerLink: dto.sellerLink,
    rating: dto.rating,
    categories: dto.categories ?? [],
    avgPrice: dto.avgPriceCents / 100,
    totalProductCnt: dto.totalProductCnt,
    totalSaleCnt: dto.totalSaleCnt,
    totalSaleGmv: dto.totalSaleGmvCents / 100,
    totalIflCnt: dto.totalIflCnt,
    totalVideoCnt: dto.totalVideoCnt,
    totalLiveCnt: dto.totalLiveCnt,
    windows: dto.windows
      ? {
          sale7dCnt: dto.windows.sale7dCnt,
          sale30dCnt: dto.windows.sale30dCnt,
          gmv7d: dto.windows.gmv7dCents / 100,
          gmv30d: dto.windows.gmv30dCents / 100,
        }
      : null,
    products: (dto.products ?? []).map((p) => ({
      productId: p.productId,
      name: p.name,
      cover: p.cover,
      avgPrice: p.avgPriceCents / 100,
      commissionRate: p.commissionRate,
      rating: p.rating,
    })),
    trend: (dto.trend ?? []).map((t) => ({ dt: t.dt, saleCnt: t.saleCnt, gmv: t.gmvCents / 100 })),
  };

  const me = await getMe();
  const workspace = me?.workspace ?? null;
  let starred = false;
  if (workspace) {
    starred = await apiServer<{ starred: boolean }>(
      `/workspaces/${workspace.id}/discover/favorites/check?kind=seller&externalId=${sellerId}&region=${region}`,
    )
      .then((r) => r.starred)
      .catch(() => false);
  }

  return (
    <SellerDetailClient
      seller={seller}
      fav={{ workspaceId: workspace?.id ?? "", isGuest: !workspace, starred }}
    />
  );
}
