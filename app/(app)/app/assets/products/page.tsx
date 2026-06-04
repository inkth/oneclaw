import { redirect } from "next/navigation";
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
  const me = await getMe();
  if (!me) redirect("/login?callbackUrl=/app/assets/products");
  const workspace = me.workspace;

  let products: GoProduct[] = [];
  try {
    const data = await apiServer<{ products: GoProduct[] }>(`/workspaces/${workspace.id}/products`);
    products = data.products ?? [];
  } catch {
    products = [];
  }

  return (
    <ProductsClient
      workspaceId={workspace.id}
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
