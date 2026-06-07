import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../_components/regions";
import { type DiscoverState } from "../_components/shared";
import { SellersClient, type Seller } from "./sellers-client";

export const metadata = { title: "选品 · 店铺榜 · OneClaw" };

type Result = { state: DiscoverState; fetchedAt: string | null; rows: Seller[] };

export default async function DiscoverSellersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (REGION_CODES.includes(sp.region as Region) ? sp.region : "US") as Region;
  const rankType = Number(sp.rank_type) || 1;
  const field = Number(sp.field) === 2 ? 2 : 1;

  let result: Result = { state: "error", fetchedAt: null, rows: [] };
  try {
    result = await apiServer<Result>(
      `/discover/seller-ranklist?region=${region}&rank_type=${rankType}&field=${field}&page_size=20`,
    );
  } catch {
    result = { state: "error", fetchedAt: null, rows: [] };
  }

  return (
    <SellersClient
      region={region}
      rankType={rankType}
      field={field}
      state={result.state}
      sellers={result.rows}
    />
  );
}
