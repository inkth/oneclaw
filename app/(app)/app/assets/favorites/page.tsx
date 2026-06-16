import { apiServer, getMe } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/EmptyState";
import { AuthModalTrigger } from "@/components/auth/AuthModalTrigger";
import { Bookmark } from "lucide-react";
import { FavoritesClient, type FavoriteItem } from "../../discover/favorites/favorites-client";

export const metadata = { title: "资产 · 我的收藏 · OneClaw" };

// 资产板块的「收藏」：复用选品的统一收藏视图(商品/店铺/达人/视频),同一份数据端点。
export default async function AssetsFavoritesPage() {
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

  const items = await apiServer<{ items: FavoriteItem[] }>(
    `/workspaces/${workspace.id}/discover/favorites`,
  )
    .then((r) => r.items ?? [])
    .catch(() => []);

  return (
    <FavoritesClient
      items={items}
      title="我的收藏"
      description="收藏的商品、店铺、达人、视频都汇总在这里,随时回看对比。"
    />
  );
}
