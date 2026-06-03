/**
 * Discover 缓存层：把 EchoTik 拉回来的数据 upsert 到本地。
 *
 * P1 增强：
 *   - 每次 persistRanklist 顺手写当天 DiscoverSnapshot
 *   - lookupRanklistCache 一并返回 7d 趋势变化
 *   - enrichCovers: batch 拉详情把 cover_url 填回去（fire-and-forget）
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ProductListItem, ProductDetail } from "./types";
import {
  getProductDetailBatch,
  parseProductCovers,
  batchDownloadCovers,
} from "./client";
import { fetchTiktokOgImages } from "./tiktok-og";
import { uploadBuffer, isStorageConfigured } from "@/lib/storage";

export const CACHE_TTL_MS = 6 * 60 * 60_000;
const PROVIDER = "echotik";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
}

export type EnrichedProduct = ProductListItem & {
  coverUrls?: Array<{ url: string; index: number }>;
  trend7dPct?: number | null; // sales 增量 %（vs 7 天前）
};

export type CacheLookup =
  | { hit: false }
  | {
      hit: true;
      fetchedAt: Date;
      date: string;
      products: EnrichedProduct[];
    };

export async function lookupRanklistCache(opts: {
  region: string;
  rankType: number;
  rankField: number;
}): Promise<CacheLookup> {
  const entry = await prisma.ranklistCacheEntry.findUnique({
    where: {
      provider_region_rankType_rankField: {
        provider: PROVIDER,
        region: opts.region,
        rankType: opts.rankType,
        rankField: opts.rankField,
      },
    },
  });
  if (!entry) return { hit: false };
  if (entry.fetchedAt.getTime() + CACHE_TTL_MS < Date.now()) {
    return { hit: false };
  }

  const rows = await prisma.discoverProduct.findMany({
    where: {
      provider: PROVIDER,
      region: opts.region,
      externalId: { in: entry.externalIds },
    },
  });
  const byId = new Map(rows.map((r) => [r.externalId, r]));

  // 7 天前的快照（如果有）
  const dpIds = rows.map((r) => r.id);
  const sevenDaysAgo = daysAgo(7);
  const snaps =
    dpIds.length > 0
      ? await prisma.discoverSnapshot.findMany({
          where: { discoverProductId: { in: dpIds }, dt: { lte: sevenDaysAgo } },
          orderBy: { dt: "desc" },
          take: dpIds.length * 5, // 多取几条，给后面 first-match 用
        })
      : [];
  const oldSalesByDpId = new Map<string, number>();
  for (const s of snaps) {
    if (!oldSalesByDpId.has(s.discoverProductId)) {
      oldSalesByDpId.set(s.discoverProductId, s.totalSaleCnt);
    }
  }

  const products: EnrichedProduct[] = entry.externalIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => {
      const old = oldSalesByDpId.get(r.id);
      const trend =
        old != null && old > 0
          ? Math.round(((r.totalSaleCnt - old) / old) * 1000) / 10 // 1 位小数
          : null;
      const coverUrls =
        r.coverUrls && Array.isArray(r.coverUrls)
          ? (r.coverUrls as Array<{ url: string; index: number }>)
          : undefined;
      return {
        product_id: r.externalId,
        product_name: r.name,
        region: r.region,
        category_id: r.categoryId ?? "",
        category_l2_id: r.categoryL2Id ?? "",
        category_l3_id: r.categoryL3Id ?? "",
        min_price: r.minPriceCents / 100,
        max_price: r.maxPriceCents / 100,
        spu_avg_price: r.avgPriceCents / 100,
        product_commission_rate: r.commissionRate,
        total_sale_cnt: r.totalSaleCnt,
        total_sale_gmv_amt: r.totalSaleGmvCents / 100,
        total_ifl_cnt: r.totalIflCnt,
        total_video_cnt: r.totalVideoCnt,
        total_live_cnt: r.totalLiveCnt,
        coverUrls,
        trend7dPct: trend,
      };
    });

  return {
    hit: true,
    fetchedAt: entry.fetchedAt,
    date: entry.date,
    products,
  };
}

/**
 * Upsert 一批 EchoTik 商品 + 当天 snapshot + 刷新 ranklist 缓存。
 */
export async function persistRanklist(opts: {
  region: string;
  rankType: number;
  rankField: number;
  date: string;
  products: ProductListItem[];
}): Promise<void> {
  if (opts.products.length === 0) return;

  // 1) Upsert products
  const upsertOps: Prisma.PrismaPromise<unknown>[] = [];
  for (const p of opts.products) {
    upsertOps.push(
      prisma.discoverProduct.upsert({
        where: {
          provider_externalId_region: {
            provider: PROVIDER,
            externalId: p.product_id,
            region: p.region,
          },
        },
        create: {
          provider: PROVIDER,
          externalId: p.product_id,
          region: p.region,
          name: p.product_name,
          categoryId: p.category_id || null,
          categoryL2Id: p.category_l2_id || null,
          categoryL3Id: p.category_l3_id || null,
          minPriceCents: Math.round(p.min_price * 100),
          maxPriceCents: Math.round(p.max_price * 100),
          avgPriceCents: Math.round(p.spu_avg_price * 100),
          commissionRate: p.product_commission_rate,
          totalSaleCnt: p.total_sale_cnt,
          totalSaleGmvCents: Math.round(p.total_sale_gmv_amt * 100),
          totalIflCnt: p.total_ifl_cnt,
          totalVideoCnt: p.total_video_cnt,
          totalLiveCnt: p.total_live_cnt,
          raw: p as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: p.product_name,
          categoryId: p.category_id || null,
          categoryL2Id: p.category_l2_id || null,
          categoryL3Id: p.category_l3_id || null,
          minPriceCents: Math.round(p.min_price * 100),
          maxPriceCents: Math.round(p.max_price * 100),
          avgPriceCents: Math.round(p.spu_avg_price * 100),
          commissionRate: p.product_commission_rate,
          totalSaleCnt: p.total_sale_cnt,
          totalSaleGmvCents: Math.round(p.total_sale_gmv_amt * 100),
          totalIflCnt: p.total_ifl_cnt,
          totalVideoCnt: p.total_video_cnt,
          totalLiveCnt: p.total_live_cnt,
          raw: p as unknown as Prisma.InputJsonValue,
          lastFetchedAt: new Date(),
        },
      }),
    );
  }
  upsertOps.push(
    prisma.ranklistCacheEntry.upsert({
      where: {
        provider_region_rankType_rankField: {
          provider: PROVIDER,
          region: opts.region,
          rankType: opts.rankType,
          rankField: opts.rankField,
        },
      },
      create: {
        provider: PROVIDER,
        region: opts.region,
        rankType: opts.rankType,
        rankField: opts.rankField,
        date: opts.date,
        externalIds: opts.products.map((p) => p.product_id),
      },
      update: {
        date: opts.date,
        externalIds: opts.products.map((p) => p.product_id),
        fetchedAt: new Date(),
      },
    }),
  );
  await prisma.$transaction(upsertOps);

  // 2) Snapshot 今天的指标（独立事务以拿到刚 upsert 后的 dp.id）
  const dps = await prisma.discoverProduct.findMany({
    where: {
      provider: PROVIDER,
      region: opts.region,
      externalId: { in: opts.products.map((p) => p.product_id) },
    },
    select: { id: true, externalId: true },
  });
  const idMap = new Map(dps.map((d) => [d.externalId, d.id]));
  const dt = today();
  const snapshotOps: Prisma.PrismaPromise<unknown>[] = [];
  for (const p of opts.products) {
    const dpId = idMap.get(p.product_id);
    if (!dpId) continue;
    snapshotOps.push(
      prisma.discoverSnapshot.upsert({
        where: { discoverProductId_dt: { discoverProductId: dpId, dt } },
        create: {
          discoverProductId: dpId,
          dt,
          totalSaleCnt: p.total_sale_cnt,
          totalSaleGmvCents: Math.round(p.total_sale_gmv_amt * 100),
          totalIflCnt: p.total_ifl_cnt,
          totalVideoCnt: p.total_video_cnt,
          totalLiveCnt: p.total_live_cnt,
        },
        update: {
          totalSaleCnt: p.total_sale_cnt,
          totalSaleGmvCents: Math.round(p.total_sale_gmv_amt * 100),
          totalIflCnt: p.total_ifl_cnt,
          totalVideoCnt: p.total_video_cnt,
          totalLiveCnt: p.total_live_cnt,
        },
      }),
    );
  }
  if (snapshotOps.length > 0) await prisma.$transaction(snapshotOps);
}

type CoverItem = {
  url: string;       // 真实可访问 URL（COS 永久 / signed 3天）
  index: number;
  raw?: string;      // EchoTik 原始 echosell 防盗链 URL（追溯用）
};

const SIGNED_HOST = "echosell-images.tos-ap-southeast-1.volces.com";
const COVER_DETAIL_CHUNK = 5;  // detail batch 一次 5 个 product
const COVER_SIGN_CHUNK = 10;   // batch/cover/download 一次 10 个 url（服务器上限）

function extOf(url: string): string {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.[a-z0-9]+$/i);
    return (m?.[0] ?? ".jpg").toLowerCase();
  } catch {
    return ".jpg";
  }
}

/**
 * 异步给一批 productIds 补 cover：
 *   1. 拉 detail 拿 cover_url (echosell 防盗链原文)
 *   2. 调 /batch/cover/download 换成 3 天签名 URL
 *   3. 若 COS 已配：fetch 字节 → 上 COS → 用 COS 永久 URL
 *      若没配：直接存签名 URL（cron 每天刷新即可）
 *   4. 落库 DiscoverProduct.coverUrls
 *
 * 安全：只对 raw 是 echosell 域名的 cover_url 处理；其它源跳过。
 * fire-and-forget 入口；内部失败不抛。
 */
export async function enrichCoversIfMissing(
  externalIds: string[],
  region: string,
): Promise<void> {
  if (externalIds.length === 0) return;
  const rows = await prisma.discoverProduct.findMany({
    where: { provider: PROVIDER, region, externalId: { in: externalIds } },
    select: { id: true, externalId: true, coverUrls: true },
  });
  const missing = rows.filter((r) => {
    const c = r.coverUrls;
    if (c == null) return true;
    if (!Array.isArray(c)) return true;
    if (c.length === 0) return true;
    // 现存 URL 仍是 echosell 原文 + 无查询串 = 旧版未签名，必须重写
    const first = c[0] as { url?: string } | undefined;
    if (!first?.url) return true;
    try {
      const u = new URL(first.url);
      if (u.host === SIGNED_HOST && !u.search) return true;
    } catch {
      return true;
    }
    return false;
  });
  if (missing.length === 0) return;

  const cosOn = isStorageConfigured();

  for (let i = 0; i < missing.length; i += COVER_DETAIL_CHUNK) {
    const productChunk = missing.slice(i, i + COVER_DETAIL_CHUNK);
    const echotikUpdated = new Set<string>(); // 本批次 EchoTik 签名路径成功更新的 productId
    try {
      // 优先复用 DB 里已有的原始 echosell URL（省 detail quota）；
      // 只有没存任何 URL 的才回退去打 detail。
      const rawByProduct = new Map<
        string,
        Array<{ url: string; index: number }>
      >();

      const needsDetail: typeof productChunk = [];
      for (const m of productChunk) {
        const existing = m.coverUrls;
        if (Array.isArray(existing) && existing.length > 0) {
          const echos = (existing as Array<{ url?: string; index?: number; raw?: string }>)
            .map((c) => ({
              url: (c.raw ?? c.url ?? "") as string,
              index: c.index ?? 0,
            }))
            .filter((c) => {
              try {
                return new URL(c.url).host === SIGNED_HOST;
              } catch {
                return false;
              }
            });
          if (echos.length > 0) {
            rawByProduct.set(m.externalId, echos);
            continue;
          }
        }
        needsDetail.push(m);
      }

      // 真的 zero-cover 的，才打 detail 拿原文
      if (needsDetail.length > 0) {
        const details = await getProductDetailBatch(
          needsDetail.map((m) => m.externalId),
          region as "US",
        );
        for (const d of details as ProductDetail[]) {
          const covers = parseProductCovers(d.cover_url).filter((c) => {
            try {
              return new URL(c.url).host === SIGNED_HOST;
            } catch {
              return false;
            }
          });
          if (covers.length > 0) rawByProduct.set(d.product_id, covers);
        }
      }

      const allRaw: string[] = [];
      for (const list of rawByProduct.values()) {
        for (const c of list) allRaw.push(c.url);
      }
      if (allRaw.length === 0) continue;

      // 2) 一口气签名（client 内部会再按 10 个一组拆分）
      const signedMap = await batchDownloadCovers(allRaw);

      // 3) 可选 COS rehost
      const finalMap = new Map<string, string>(); // raw → final url
      const productOf = (raw: string) => {
        for (const [pid, list] of rawByProduct) {
          if (list.some((c) => c.url === raw)) return pid;
        }
        return null;
      };

      for (const [raw, signed] of signedMap) {
        if (!cosOn) {
          finalMap.set(raw, signed);
          continue;
        }
        try {
          const fetched = await fetch(signed);
          if (!fetched.ok) {
            console.warn("[echotik] signed url fetch failed", fetched.status);
            finalMap.set(raw, signed); // 退到签名 URL
            continue;
          }
          const ct = fetched.headers.get("content-type") || "image/jpeg";
          const buf = Buffer.from(await fetched.arrayBuffer());
          const pid = productOf(raw);
          const filename = new URL(raw).pathname.split("/").pop() || "cover";
          const key = `discover-covers/${region}/${pid}/${filename}${
            filename.includes(".") ? "" : extOf(raw)
          }`;
          const uploaded = await uploadBuffer({
            buf,
            pathname: key,
            contentType: ct,
          });
          finalMap.set(raw, uploaded?.url ?? signed);
        } catch (e) {
          console.error("[echotik] rehost to COS failed", e);
          finalMap.set(raw, signed);
        }
      }

      // 4) 落库
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      for (const [pid, rawCovers] of rawByProduct) {
        const local = productChunk.find((m) => m.externalId === pid);
        if (!local) continue;
        const finalCovers: CoverItem[] = rawCovers
          .map((c) => ({
            url: finalMap.get(c.url) ?? c.url,
            index: c.index,
            raw: c.url,
          }))
          .filter((c) => c.url !== c.raw); // 没换到的别落库（继续 NULL，下次再试）
        if (finalCovers.length === 0) continue;
        ops.push(
          prisma.discoverProduct.update({
            where: { id: local.id },
            data: { coverUrls: finalCovers as unknown as Prisma.InputJsonValue },
          }),
        );
        echotikUpdated.add(pid);
      }
      if (ops.length > 0) await prisma.$transaction(ops);
      console.log(
        `[echotik] enrich chunk: products=${productChunk.length} signed=${signedMap.size} cos=${cosOn ? "on" : "off"} updated=${ops.length}`,
      );
    } catch (e) {
      console.error("[echotik] enrichCovers chunk failed", e);
    }

    // === Fallback: TikTok 商品页 og:image ===
    // EchoTik 签名失败 / 配额耗尽时，每个商品退到拉 1 张主图。
    const fallbackTargets = productChunk.filter(
      (m) => !echotikUpdated.has(m.externalId),
    );
    if (fallbackTargets.length === 0) continue;
    try {
      const ogMap = await fetchTiktokOgImages(
        fallbackTargets.map((m) => m.externalId),
        300,
      );
      if (ogMap.size === 0) continue;
      const ogOps: Prisma.PrismaPromise<unknown>[] = [];
      for (const m of fallbackTargets) {
        const og = ogMap.get(m.externalId);
        if (!og) continue;
        const cover: CoverItem = { url: og, index: 0 };
        ogOps.push(
          prisma.discoverProduct.update({
            where: { id: m.id },
            data: {
              coverUrls: [cover] as unknown as Prisma.InputJsonValue,
            },
          }),
        );
      }
      if (ogOps.length > 0) {
        await prisma.$transaction(ogOps);
        console.log(
          `[echotik/fallback] tiktok-og filled ${ogOps.length}/${fallbackTargets.length}`,
        );
      }
    } catch (e) {
      console.error("[echotik/fallback] tiktok-og failed", e);
    }
  }
}

export async function getDiscoverProduct(externalId: string, region: string) {
  return prisma.discoverProduct.findUnique({
    where: {
      provider_externalId_region: { provider: PROVIDER, externalId, region },
    },
  });
}
