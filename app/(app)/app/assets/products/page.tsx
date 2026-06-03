import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { ProductsClient } from "./products-client";

export const metadata = { title: "商品 · OneClaw" };

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  const products = await prisma.product.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ status: "asc" }, { roiScore: "desc" }],
    include: { shop: { select: { id: true, name: true, platform: true } } },
  });

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
        shop: p.shop
          ? { id: p.shop.id, name: p.shop.name, platform: p.shop.platform }
          : null,
      }))}
    />
  );
}
