import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../_components/regions";
import { type DiscoverState } from "../_components/shared";
import { VideosClient, type Video } from "./videos-client";

export const metadata = { title: "选品 · 带货视频榜 · OneClaw" };

type Result = { state: DiscoverState; fetchedAt: string | null; rows: Video[] };

export default async function DiscoverVideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (REGION_CODES.includes(sp.region as Region) ? sp.region : "US") as Region;
  const rankType = Number(sp.rank_type) || 1;
  const field = Number(sp.field) === 2 ? 2 : 1;

  // EchoTik 视频榜不支持按商品类目过滤,故不提供分类筛选(避免「点了没反应」的假筛选)。
  const result = await apiServer<Result>(
    `/discover/video-ranklist?region=${region}&rank_type=${rankType}&field=${field}&page_size=20`,
  ).catch((): Result => ({ state: "error", fetchedAt: null, rows: [] }));

  return (
    <VideosClient
      region={region}
      rankType={rankType}
      field={field}
      state={result.state}
      videos={result.rows}
    />
  );
}
