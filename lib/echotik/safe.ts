/**
 * Discover 的"安全 + 缓存"包装：
 *   1. 先查 DB 缓存（< 6h 直接命中，附带 7d 趋势 + coverUrls）
 *   2. miss → 调 EchoTik → upsert + 写当天 snapshot → 异步补 cover → 返回
 *   3. 没配凭证 → mock
 *   4. 真实调用挂掉 → 降级 mock + error
 */
import { after } from "next/server";
import { getProductRanklist, type RanklistParams } from "./client";
import { mockRanklist } from "./mock";
import {
  lookupRanklistCache,
  persistRanklist,
  enrichCoversIfMissing,
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

  try {
    const list = await getProductRanklist(params);
    if (list.length === 0) {
      return { products: [], state: "empty" };
    }
    await persistRanklist({
      region: params.region,
      rankType: params.rank_type,
      rankField: params.product_rank_field,
      date: new Date().toISOString().slice(0, 10),
      products: list,
    });
    // 触发异步 cover 补全
    after(async () => {
      await enrichCoversIfMissing(
        list.map((p) => p.product_id),
        params.region,
      );
    });
    return { products: list.map(asEnriched), state: "live", fetchedAt: new Date() };
  } catch (e) {
    console.error("[echotik] safeRanklist failed, falling back to mock", e);
    return {
      products: mockRanklist(params.region, params.page_size ?? 10).map(asEnriched),
      state: "error",
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}
