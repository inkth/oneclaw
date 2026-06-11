import { getMe, apiServer } from "@/lib/api-client";
import { ProductsClient } from "./products-client";

export const metadata = { title: "商品 · OneClaw" };

type GoProduct = {
  id: string;
  title: string;
  category: string;
  emoji: string | null;
  priceCents: number;
  costCents: number;
  marginPct: number;
  roiScore: number;
  monthlySales: number;
  trendDelta: number;
  status: "RECOMMENDED" | "EVALUATING" | "ARCHIVED";
  note: string | null;
};

export default async function ProductsPage() {
  // 游客可见(空选品库);登录后拉真实数据。
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  let products: GoProduct[] = [];
  if (workspace) {
    try {
      const data = await apiServer<{ products: GoProduct[] }>(`/workspaces/${workspace.id}/products`);
      products = data.products ?? [];
    } catch {
      products = [];
    }
  }

  return (
    // key：弹窗内登录后 refresh 重传 props，强制重挂载以重置 useState(initial*)
    <ProductsClient
      key={me?.user?.id ?? "guest"}
      workspaceId={workspace?.id ?? ""}
      initialProducts={products.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        emoji: p.emoji,
        priceCents: p.priceCents,
        costCents: p.costCents,
        marginPct: p.marginPct,
        roiScore: p.roiScore,
        monthlySales: p.monthlySales,
        trendDelta: p.trendDelta,
        status: p.status,
        note: p.note,
        shop: null,
      }))}
    />
  );
}
