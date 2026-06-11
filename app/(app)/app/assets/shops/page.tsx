import { getMe, apiServer } from "@/lib/api-client";
import { ShopsClient } from "./shops-client";

export const metadata = { title: "店铺 · OneClaw" };

type Props = Parameters<typeof ShopsClient>[0];
type Initial = Props["initialShops"];
type Totals = Props["totals"];

export default async function ShopsPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  let shops: Initial = [];
  let totals: Totals = { revenueCents: 0, orders: 0, itemsSold: 0, visitors: 0 };
  if (ws) {
    try {
      const d = await apiServer<{ shops: Initial; totals: Totals }>(`/workspaces/${ws.id}/shops`);
      shops = d.shops ?? [];
      totals = d.totals ?? totals;
    } catch {
      shops = [];
    }
  }
  return <ShopsClient workspaceId={ws?.id ?? ""} initialShops={shops} totals={totals} isGuest={!ws} />;
}
