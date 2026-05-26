/**
 * EchoTik API client (server-only).
 *
 * - HTTP Basic Auth using ECHOTIK_USERNAME / ECHOTIK_PASSWORD env vars.
 * - Unwraps the {code, message, data} envelope. `code === 0` is success;
 *   anything else throws EchoTikError with the server message.
 * - Uses native fetch with Next.js caching hints. Most callers should wrap
 *   the call in a `'use cache'` helper (see app/lib/echotik-cached.ts) to
 *   benefit from Next.js Data Cache.
 *
 * 🚫 Do NOT import this from a Client Component — it reads server-only env.
 */

// NOTE: This module is server-only. It reads ECHOTIK_USERNAME/PASSWORD from
// process.env and must never be imported from a Client Component. Next.js
// will refuse to bundle it client-side because of process.env access, but if
// you want a hard guard, install the `server-only` package and re-add the
// `import 'server-only'` line at the top of this file.
import type {
  EchoTikEnvelope, Region, Language, RankType, RankField,
  Category, ProductListItem, ProductDetail,
  ProductInfluencer, ProductVideo, ProductTrendPoint,
} from './types';

const BASE_URL = process.env.ECHOTIK_BASE_URL ?? 'https://open.echotik.live/api/v3';

export class EchoTikError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly endpoint: string,
    public readonly requestId?: string | null,
  ) {
    super(`[EchoTik ${code}] ${endpoint}: ${message}`);
    this.name = 'EchoTikError';
  }
}

function authHeader(): string {
  const u = process.env.ECHOTIK_USERNAME;
  const p = process.env.ECHOTIK_PASSWORD;
  if (!u || !p) {
    throw new Error(
      'EchoTik credentials missing. Set ECHOTIK_USERNAME and ECHOTIK_PASSWORD in .env.local',
    );
  }
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

interface CallOptions {
  /** Next.js fetch revalidate (seconds). Default 600 = 10min cache. */
  revalidate?: number | false;
  /** Cache tag(s) for selective revalidation. */
  tags?: string[];
}

async function call<T>(
  endpoint: string,
  params: Record<string, string | number | undefined | null>,
  opts: CallOptions = {},
): Promise<T> {
  const url = new URL(BASE_URL + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
    next: {
      revalidate: opts.revalidate ?? 600,
      tags: opts.tags,
    },
  });

  if (!res.ok) {
    throw new EchoTikError(`HTTP ${res.status}`, res.status, endpoint);
  }

  const body = (await res.json()) as EchoTikEnvelope<T>;
  if (body.code !== 0 && body.code !== 200) {
    throw new EchoTikError(body.message, body.code, endpoint, body.requestId);
  }
  return body.data;
}

// ── Category ───────────────────────────────────────────────────────────────
export async function listCategoriesL1(
  language: Language = 'en-US',
  region?: Region,
) {
  return call<Category[]>('/echotik/category/l1', { language, region });
}

export async function listCategoriesL2(parentId: string, language: Language = 'en-US') {
  return call<Category[]>('/echotik/category/l2', { parent_id: parentId, language });
}

export async function listCategoriesL3(parentId: string, language: Language = 'en-US') {
  return call<Category[]>('/echotik/category/l3', { parent_id: parentId, language });
}

// ── Products ───────────────────────────────────────────────────────────────
export interface RanklistParams {
  region: Region;
  rank_type: RankType;
  product_rank_field: RankField;
  /** YYYY-MM-DD. Defaults to yesterday (server has T-1 data). */
  date?: string;
  page_num?: number;
  page_size?: number;
  category_id?: string;
  category_l2_id?: string;
  category_l3_id?: string;
}

/** Server caps page_size at 10 on every list endpoint. */
const MAX_PAGE_SIZE = 10;

export async function getProductRanklist(params: RanklistParams) {
  const date = params.date ?? yesterday();
  const desired = params.page_size ?? 20;
  const pageSize = Math.min(desired, MAX_PAGE_SIZE);
  const startPage = params.page_num ?? 1;
  const pagesNeeded = Math.ceil(desired / pageSize);

  const common = {
    region: params.region,
    rank_type: params.rank_type,
    product_rank_field: params.product_rank_field,
    date,
    page_size: pageSize,
    category_id: params.category_id,
    category_l2_id: params.category_l2_id,
    category_l3_id: params.category_l3_id,
  };

  const pages = await Promise.all(
    Array.from({ length: pagesNeeded }, (_, i) =>
      call<ProductListItem[]>(
        '/echotik/product/ranklist',
        { ...common, page_num: startPage + i },
        { revalidate: 1800, tags: [`ranklist:${params.region}`] },
      ),
    ),
  );
  return pages.flat().slice(0, desired);
}

export async function getProductDetail(productId: string, region: Region = 'US') {
  // Batch endpoint — accepts comma-separated `product_ids`. We always
  // request one and return the first element for ergonomics.
  const list = await call<ProductDetail[]>(
    '/echotik/product/detail',
    { product_ids: productId, region },
    { revalidate: 600, tags: [`product:${productId}`] },
  );
  return list[0] ?? null;
}

export async function getProductDetailBatch(productIds: string[], region: Region = 'US') {
  return call<ProductDetail[]>(
    '/echotik/product/detail',
    { product_ids: productIds.join(','), region },
    { revalidate: 600 },
  );
}

export async function getProductInfluencers(
  productId: string,
  page_num = 1,
  page_size = 10,
) {
  return call<ProductInfluencer[]>(
    '/echotik/product/influencer/list',
    { product_id: productId, page_num, page_size: Math.min(page_size, MAX_PAGE_SIZE) },
    { revalidate: 1800, tags: [`product:${productId}:influencers`] },
  );
}

export async function getProductVideos(
  productId: string,
  page_num = 1,
  page_size = 10,
) {
  return call<ProductVideo[]>(
    '/echotik/product/video/list',
    { product_id: productId, page_num, page_size: Math.min(page_size, MAX_PAGE_SIZE) },
    { revalidate: 1800, tags: [`product:${productId}:videos`] },
  );
}

export async function getProductTrend(
  productId: string,
  start_date?: string,
  end_date?: string,
) {
  // Page size capped at 10 by the server. For 30d we'd need multiple pages,
  // but daily granularity over a week-or-two is the common case.
  return call<ProductTrendPoint[]>(
    '/echotik/product/trend',
    {
      product_id: productId,
      start_date: start_date ?? daysAgo(10),
      end_date: end_date ?? yesterday(),
      page_num: 1,
      page_size: 10,
    },
    { revalidate: 3600, tags: [`product:${productId}:trend`] },
  );
}

// ── helpers ────────────────────────────────────────────────────────────────
function yesterday() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

/** Cover URLs are returned as a stringified JSON array; parse helper. */
export function parseProductCovers(raw: string): { url: string; index: number }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as { url: string; index: number }[];
    return Array.isArray(arr) ? arr.sort((a, b) => a.index - b.index) : [];
  } catch {
    return [];
  }
}
