/**
 * Discover 的"安全 + 缓存"包装：
 *   1. 先查 DB 缓存（< 6h 直接命中，附带 7d 趋势 + coverUrls）
 *   2. miss → 调 EchoTik → upsert + 写当天 snapshot → 异步补 cover → 返回
 *   3. 没配凭证 → mock
 *   4. 真实调用挂掉 → 降级 mock + error
 */
import { after } from "next/server";
import { unstable_cache } from "next/cache";
import {
  getProductRanklist,
  getSellerRanklist,
  getInfluencerRanklist,
  getVideoRanklist,
  listCategoriesL1,
  batchDownloadCovers,
  type RanklistParams,
  type EntityRanklistParams,
} from "./client";
import type { Region } from "./types";
import {
  mockRanklist,
  mockSellers,
  mockInfluencers,
  mockVideos,
} from "./mock";
import type {
  SellerListItem,
  InfluencerRankItem,
  VideoRankItem,
} from "./types";
import {
  lookupRanklistCache,
  persistRanklist,
  enrichCoversIfMissing,
  attachExistingCovers,
  type EnrichedProduct,
} from "./cache";

export function isEchoTikConfigured(): boolean {
  return Boolean(process.env.ECHOTIK_USERNAME && process.env.ECHOTIK_PASSWORD);
}

export type SafeRanklistState = "live" | "cached" | "empty" | "mock" | "error";

export type SafeRanklistResult = {
  products: EnrichedProduct[];
  state: SafeRanklistState;
  fetchedAt?: Date;
  date?: string;
  error?: string;
};

function asEnriched(p: ReturnType<typeof mockRanklist>[number]): EnrichedProduct {
  return p as EnrichedProduct;
}

export async function safeRanklist(params: RanklistParams): Promise<SafeRanklistResult> {
  if (!isEchoTikConfigured()) {
    return {
      products: mockRanklist(params.region, params.page_size ?? 10).map(asEnriched),
      state: "mock",
    };
  }

  // DB 快照缓存只按 region/rankType/rankField 建键，不含类目。一旦带类目筛选，
  // 命中的会是"无类目全量"榜，造成串榜——所以带类目时直接绕过 DB 缓存走实时
  // （getProductRanklist 已把 category_id 透传给 EchoTik），也不回写污染默认缓存。
  const hasCategory = Boolean(
    params.category_id || params.category_l2_id || params.category_l3_id,
  );

  if (!hasCategory) {
    const cached = await lookupRanklistCache({
      region: params.region,
      rankType: params.rank_type,
      rankField: params.product_rank_field,
    });
    if (cached.hit && cached.products.length > 0) {
      // 即便命中缓存，缺 cover 的也异步补一下（不阻塞）
      const missing = cached.products
        .filter((p) => !p.coverUrls || p.coverUrls.length === 0)
        .map((p) => p.product_id);
      if (missing.length > 0) {
        after(async () => {
          await enrichCoversIfMissing(missing, params.region);
        });
      }
      return {
        products: cached.products.slice(0, params.page_size ?? 10),
        state: "cached",
        fetchedAt: cached.fetchedAt,
        date: cached.date,
      };
    }
  }

  try {
    const list = await getProductRanklist(params);
    if (list.length === 0) {
      return { products: [], state: "empty" };
    }
    const date = new Date().toISOString().slice(0, 10);
    if (!hasCategory) {
      await persistRanklist({
        region: params.region,
        rankType: params.rank_type,
        rankField: params.product_rank_field,
        date,
        products: list,
      });
    }
    // 榜单接口不含封面，贴回 DB 里已 enrich 的封面（热门商品多半已有）。
    const enriched = await attachExistingCovers(list, params.region);
    after(async () => {
      // 指定类目的实时结果也入库（不写榜单缓存，避免串榜），
      // 好让 enrich 能给从没见过的新商品补封面，下次打开即有图。
      if (hasCategory) {
        await persistRanklist({
          region: params.region,
          rankType: params.rank_type,
          rankField: params.product_rank_field,
          date,
          products: list,
          writeCacheEntry: false,
        });
      }
      await enrichCoversIfMissing(
        list.map((p) => p.product_id),
        params.region,
      );
    });
    return { products: enriched, state: "live", fetchedAt: new Date() };
  } catch (e) {
    console.error("[echotik] safeRanklist failed, falling back to mock", e);
    return {
      products: mockRanklist(params.region, params.page_size ?? 10).map(asEnriched),
      state: "error",
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}

// ── 店铺 / 达人 / 视频：浏览型 safe 包装 ─────────────────────────────────────
// 不走商品那套重的 DB 快照管线（无导入/收藏/分析需求），直接依赖 client 里
// call() 的 Next.js Data Cache，并在返回前把防盗链图片批量换成签名 URL。

export type SafeEntityResult<T> = {
  rows: T[];
  state: SafeRanklistState;
  fetchedAt?: Date;
  /** 原始防盗链 URL → 3 天有效签名 URL；签名失败时该项缺省，页面回退渐变占位。 */
  signed: Record<string, string>;
  error?: string;
};

/** 批量把一组防盗链原始 URL 换成签名 URL；任何异常都吞掉返回已得到的部分。 */
async function signImages(urls: Array<string | null | undefined>): Promise<Record<string, string>> {
  const uniq = Array.from(new Set(urls.filter((u): u is string => Boolean(u))));
  if (uniq.length === 0) return {};
  try {
    const map = await batchDownloadCovers(uniq);
    return Object.fromEntries(map);
  } catch (e) {
    console.error("[echotik] signImages failed (non-fatal)", e);
    return {};
  }
}

/** 三个浏览型实体共用的 safe 执行器：mock 守卫 → 真实拉取 → 签名 → 错误降级。 */
async function safeEntity<T>(
  fetcher: (p: EntityRanklistParams) => Promise<T[]>,
  mock: (region: string, limit?: number) => T[],
  extractImages: (row: T) => Array<string | null | undefined>,
  params: EntityRanklistParams,
): Promise<SafeEntityResult<T>> {
  const limit = params.page_size ?? 20;
  if (!isEchoTikConfigured()) {
    return { rows: mock(params.region, limit), state: "mock", signed: {} };
  }
  try {
    const rows = await fetcher(params);
    if (rows.length === 0) return { rows: [], state: "empty", signed: {} };
    const signed = await signImages(rows.flatMap(extractImages));
    return { rows, state: "live", fetchedAt: new Date(), signed };
  } catch (e) {
    console.error("[echotik] safeEntity failed, falling back to mock", e);
    return {
      rows: mock(params.region, limit),
      state: "error",
      signed: {},
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}

export function safeSellerRanklist(params: EntityRanklistParams) {
  return safeEntity<SellerListItem>(
    getSellerRanklist,
    mockSellers,
    (r) => [r.cover_url],
    params,
  );
}

export function safeInfluencerRanklist(params: EntityRanklistParams) {
  return safeEntity<InfluencerRankItem>(
    getInfluencerRanklist,
    mockInfluencers,
    (r) => [r.avatar],
    params,
  );
}

export function safeVideoRanklist(params: EntityRanklistParams) {
  return safeEntity<VideoRankItem>(
    getVideoRanklist,
    mockVideos,
    (r) => [r.reflow_cover, r.avatar],
    params,
  );
}

export type CategoryOption = { id: string; name: string };

/**
 * 一级类目下拉用：取 region 的 L1 列表（统一用 zh-CN，展示中文类目名）。
 *
 * ⚠️ 必须用 unstable_cache 包一层：discover 页在 auth()/searchParams 这些
 * request-time API 之后才发起本调用，Next 16 默认 fetchCache='auto' 会
 * 「不缓存 request-time API 之后的 fetch」，导致 client.ts 里的
 * next.revalidate 形同虚设、每次打开页面都实时打 EchoTik（~4s）。
 * unstable_cache 的缓存不受渲染位置影响，按 region 建键，6h 刷新一次。
 */
// 一级类目的展示顺序（产品指定，非字母序）。不在表里的新类目排到最后、按拼音兜底。
const CATEGORY_ORDER = [
  "美妆个护",
  "女装与女士内衣",
  "保健",
  "时尚配件",
  "运动与户外",
  "手机与数码",
  "居家日用",
  "食品饮料",
  "汽车与摩托车",
  "男装与男士内衣",
  "收藏品",
  "玩具和爱好",
  "厨房用品",
  "家装建材",
  "电脑办公",
  "箱包",
  "鞋靴",
  "五金工具",
  "家纺布艺",
  "家电",
  "宠物用品",
  "珠宝与衍生品",
  "图书&杂志&音频",
  "母婴用品",
  "家具",
  "儿童时尚",
  "穆斯林时尚",
  "二手",
  "虚拟商品",
];
const categoryRank = new Map(CATEGORY_ORDER.map((name, i) => [name, i]));

const getCachedCategoriesL1 = unstable_cache(
  async (region: Region): Promise<CategoryOption[]> => {
    const cats = await listCategoriesL1("zh-CN", region);
    return cats
      .filter((c) => c.category_id && c.category_id !== "0")
      .map((c) => ({ id: c.category_id, name: c.category_name }))
      .sort((a, b) => {
        const ra = categoryRank.get(a.name) ?? Number.MAX_SAFE_INTEGER;
        const rb = categoryRank.get(b.name) ?? Number.MAX_SAFE_INTEGER;
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
      });
  },
  ["echotik-categories-l1"],
  { revalidate: 6 * 60 * 60, tags: ["echotik:categories"] },
);

export async function safeCategoriesL1(region: Region): Promise<CategoryOption[]> {
  if (!isEchoTikConfigured()) return [];
  try {
    return await getCachedCategoriesL1(region);
  } catch (e) {
    console.error("[echotik] safeCategoriesL1 failed (non-fatal)", e);
    return [];
  }
}
