import { apiServer, getMe } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/EmptyState";
import { AuthModalTrigger } from "@/components/auth/AuthModalTrigger";
import { Bookmark } from "lucide-react";
import { FavoritesClient, type FavoriteItem } from "./favorites-client";

export const metadata = { title: "收藏 · OneClaw" };

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
};

export default async function FavoritesPage() {
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  if (!workspace) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Bookmark}
          title="登录后查看收藏"
          description="收藏的商品、店铺、达人、视频会汇总在这里。登录即可开始收藏。"
        />
        <div className="text-center">
          <AuthModalTrigger
            label="去登录 →"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
            options={{
              title: "登录后查看收藏",
              desc: "收藏的商品、店铺、达人、视频会汇总在这里。",
            }}
          />
        </div>
      </div>
    );
  }

  // 商品收藏走选品 products 表;店铺/达人/视频走 discover/favorites。
  const [products, items] = await Promise.all([
    apiServer<{ products: GoProduct[] }>(`/workspaces/${workspace.id}/products`)
      .then((r) => r.products ?? [])
      .catch((): GoProduct[] => []),
    apiServer<{ items: FavoriteItem[] }>(`/workspaces/${workspace.id}/discover/favorites`)
      .then((r) => r.items ?? [])
      .catch((): FavoriteItem[] => []),
  ]);

  return (
    // key:弹窗内登录后 refresh 重传 props,强制重挂载以重置子组件 useState
    <FavoritesClient
      key={me?.user?.id ?? "guest"}
      workspaceId={workspace.id}
      products={products.map((p) => ({
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
        shop: null,
      }))}
      favorites={items}
    />
  );
}
