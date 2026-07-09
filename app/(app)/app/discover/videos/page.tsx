import { apiServer } from "@/lib/api-client";
import { REGION_CODES, type Region } from "../_components/regions";
import { type DiscoverState } from "../_components/shared";
import { fetchCategories } from "../_components/categories";
import { VideosClient, type Video } from "./videos-client";

export const metadata = { title: "选品 · 带货视频榜 · 发现猫" };

type Result = { state: DiscoverState; fetchedAt: string | null; rows: Video[] };

export default async function DiscoverVideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const region = (REGION_CODES.includes(sp.region as Region) ? sp.region : "US") as Region;
  const rankType = Number(sp.rank_type) || 1;
  // 默认带货榜(video_rank_field=2, total_video_sale_cnt);1=播放热门榜。
  const field = Number(sp.field) === 1 ? 1 : 2;
  const categoryId = sp.category_id || null;
  const page = Math.min(Math.max(Number(sp.page) || 1, 1), 10);
  const q = (sp.q ?? "").trim();
  // AI 视频筛选(仅榜单态生效;搜索接口不支持 created_by_ai)。后端对该视图走实时旁路、不落缓存。
  const ai = sp.ai === "1" || sp.ai === "true";
  // 类目=按带货视频的「商品类目」过滤(后端映射到 EchoTik product_category_id)。
  // 搜索:走关键词搜索(只认 region,单次 ≤30、无分页);否则正常榜单+类目+分页。
  const query = q
    ? `region=${region}&page_size=30&keyword=${encodeURIComponent(q)}`
    : `region=${region}&rank_type=${rankType}&field=${field}${categoryId ? `&category_id=${categoryId}` : ""}${ai ? "&created_by_ai=true" : ""}&page_size=20&page_num=${page}`;

  const [result, categories] = await Promise.all([
    apiServer<Result>(`/discover/video-ranklist?${query}`).catch(
      (): Result => ({ state: "error", fetchedAt: null, rows: [] }),
    ),
    fetchCategories(region),
  ]);

  return (
    <VideosClient
      region={region}
      rankType={rankType}
      field={field}
      categoryId={categoryId}
      categories={categories}
      keyword={q}
      ai={ai}
      state={result.state}
      videos={result.rows}
      page={page}
      hasNext={!q && result.rows.length >= 20 && page < 10}
    />
  );
}
