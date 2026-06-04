import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { ShopsClient } from "./shops-client";

export const metadata = { title: "店铺 · OneClaw" };

export default async function ShopsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/app");
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  const shops = await prisma.shop.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { products: true } } },
  });

  const totals = shops.reduce(
    (acc, s) => ({
      revenueCents: acc.revenueCents + s.totalRevenueCents,
      orders: acc.orders + s.orders,
      itemsSold: acc.itemsSold + s.itemsSold,
      visitors: acc.visitors + s.visitors,
    }),
    { revenueCents: 0, orders: 0, itemsSold: 0, visitors: 0 },
  );

  return (
    <ShopsClient
      workspaceId={workspace.id}
      totals={totals}
      initialShops={shops.map((s) => ({
        id: s.id,
        name: s.name,
        platform: s.platform,
        country: s.country,
        status: s.status,
        totalRevenueCents: s.totalRevenueCents,
        orders: s.orders,
        itemsSold: s.itemsSold,
        visitors: s.visitors,
        conversionRate: s.conversionRate,
        productCount: s._count.products,
        createdAt: s.createdAt.toISOString(),
        lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
      }))}
    />
  );
}
