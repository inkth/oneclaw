import { apiServer, getMe } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/EmptyState";
import { AuthModalTrigger } from "@/components/auth/AuthModalTrigger";
import { Bookmark } from "lucide-react";
import { FavoritesClient, type FavoriteItem } from "./favorites-client";

export const metadata = { title: "选品 · 我的收藏 · OneClaw" };

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

  const items = await apiServer<{ items: FavoriteItem[] }>(
    `/workspaces/${workspace.id}/discover/favorites`,
  )
    .then((r) => r.items ?? [])
    .catch(() => []);

  return <FavoritesClient items={items} />;
}
