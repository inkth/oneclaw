import { getMe, apiServer } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/EmptyState";
import { Package } from "lucide-react";
import { ProductDetail, type Kit } from "./detail-client";

export const metadata = { title: "商品详情 · 发现猫" };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  if (!workspace) {
    return (
      <EmptyState
        icon={Package}
        title="登录后查看商品"
        description="自建商品和它的 Listing、主图会保存在工作台。"
      />
    );
  }

  const kit = await apiServer<{ kit: Kit }>(
    `/workspaces/${workspace.id}/products/${id}/publish-kit`,
  )
    .then((r) => r.kit)
    .catch(() => null);

  if (!kit) {
    return (
      <EmptyState
        icon={Package}
        title="商品不存在或已删除"
        description="回到收藏页查看你的商品。"
      />
    );
  }

  return (
    <ProductDetail
      key={workspace.id}
      workspaceId={workspace.id}
      productId={id}
      initialKit={kit}
    />
  );
}
