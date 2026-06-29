import { apiServer, getMe } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/EmptyState";
import { AuthModalTrigger } from "@/components/auth/AuthModalTrigger";
import { Package } from "lucide-react";
import { ProductsClient, type Product } from "./products-client";

export const metadata = { title: "我的商品 · 发现猫" };

// 后端 ProductListItem(金额 cents + coverUrl + images/imagesStatus + discoverProductId)。
type GoProduct = {
  id: string;
  title: string;
  category: string;
  emoji: string | null;
  priceCents: number;
  costCents: number;
  costSource: "ESTIMATE" | "MANUAL" | "SOURCED";
  marginPct: number;
  roiScore: number;
  monthlySales: number;
  trendDelta: number;
  status: "CANDIDATE" | "RECOMMENDED" | "EVALUATING" | "ARCHIVED";
  note: string | null;
  coverUrl?: string;
  images?: string[];
  imagesStatus?: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "";
  discoverProductId?: string | null;
};

function mapProduct(p: GoProduct): Product {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    emoji: p.emoji,
    priceCents: p.priceCents,
    costCents: p.costCents,
    costSource: p.costSource,
    marginPct: p.marginPct,
    roiScore: p.roiScore,
    monthlySales: p.monthlySales,
    trendDelta: p.trendDelta,
    status: p.status,
    note: p.note,
    coverUrl: p.coverUrl,
    images: p.images,
    imagesStatus: p.imagesStatus,
    discoverProductId: p.discoverProductId,
    shop: null,
  };
}

// 资产 · 我的商品:用户在素材库「批量做商品」生成的自建商品(discoverProductId 为空)。
// EchoTik 收藏的爆品走「选品 · 收藏」,这里只看自己的货。
export default async function MyProductsPage() {
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  if (!workspace) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Package}
          title="登录后查看你的商品"
          description="在素材库多选商品图「批量做商品」,生成的商品卡会汇总在这里。"
        />
        <div className="text-center">
          <AuthModalTrigger
            label="去登录 →"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
            options={{ title: "登录后查看你的商品", desc: "自建商品和它的 Listing、主图会保存在工作台。" }}
          />
        </div>
      </div>
    );
  }

  const products = await apiServer<{ products: GoProduct[] }>(`/workspaces/${workspace.id}/products`)
    .then((r) => r.products ?? [])
    .catch((): GoProduct[] => []);

  return (
    <ProductsClient
      key={me?.user?.id ?? "guest"}
      workspaceId={workspace.id}
      scope="self"
      initialProducts={products.map(mapProduct)}
    />
  );
}
