/**
 * EchoTik API types — derived from real smoke-test responses against
 * https://open.echotik.live/api/v3 on 2026-05-26.
 *
 * Field names mirror the raw API for now; we can wrap into a friendlier
 * domain model in `model.ts` once the UI shape stabilises.
 */

// ── Common envelope ────────────────────────────────────────────────────────
export interface EchoTikEnvelope<T> {
  code: number;          // 0 = success, anything else = business error
  message: string;
  data: T;
  requestId?: string | null;
}

export type Region = 'US' | 'GB' | 'ID' | 'TH' | 'VN' | 'MY';
export type Language = 'en-US' | 'th-TH' | 'id-ID' | 'zh-CN' | 'ms-MY' | 'vi-VN';

/** rank_type enum (numeric per API). Mapping inferred from smoke-test. */
export const RankType = {
  HOT: 1,
  RISING: 2,
  NEW: 3,
} as const;
export type RankType = typeof RankType[keyof typeof RankType];

/** product_rank_field enum (numeric per API). 1 = sales (confirmed). */
export const RankField = {
  SALES: 1,
  GMV: 2,
  GROWTH: 3,
} as const;
export type RankField = typeof RankField[keyof typeof RankField];

/**
 * seller / influencer / video ranklist 的排序字段。探测确认服务端只接受 1 和 2
 * （> 2 报 "must be less than or equal to 2"），分别是 销量 / GMV。
 */
export const EntityRankField = {
  SALES: 1,
  GMV: 2,
} as const;
export type EntityRankField = typeof EntityRankField[keyof typeof EntityRankField];

// ── Category ───────────────────────────────────────────────────────────────
export interface Category {
  category_id: string;
  category_level: string;   // "1" | "2" | "3"
  category_name: string;
  language: string;
  parent_id: string;
}

// ── Product (list / ranklist row) ──────────────────────────────────────────
export interface ProductListItem {
  product_id: string;
  product_name: string;
  region: string;
  category_id: string;
  category_l2_id: string;
  category_l3_id: string;
  min_price: number;
  max_price: number;
  spu_avg_price: number;
  product_commission_rate: number;
  total_sale_cnt: number;
  total_sale_gmv_amt: number;
  total_ifl_cnt: number;     // # of带货达人
  total_video_cnt: number;
  total_live_cnt: number;
}

// ── Product Detail (extends list with windowed metrics) ────────────────────
export interface ProductDetail extends ProductListItem {
  cover_url: string;          // stringified JSON array
  desc_detail: string;
  discount: number | string;
  first_crawl_dt: string;
  free_shipping: number | boolean;
  is_s_shop: number;
  off_mark: number | string;
  product_rating: number;
  review_count: number;
  sale_props: string;
  sales_flag: number | string;
  sales_trend_flag: number | string;
  seller_id: string;
  skus: string;
  specification: string;

  // Windowed counts — server provides 1d/7d/15d/30d/60d/90d for each metric
  total_sale_1d_cnt: number;  total_sale_7d_cnt: number;  total_sale_15d_cnt: number;
  total_sale_30d_cnt: number; total_sale_60d_cnt: number; total_sale_90d_cnt: number;

  total_sale_gmv_1d_amt: number;  total_sale_gmv_7d_amt: number;  total_sale_gmv_15d_amt: number;
  total_sale_gmv_30d_amt: number; total_sale_gmv_60d_amt: number; total_sale_gmv_90d_amt: number;

  total_video_1d_cnt: number;  total_video_7d_cnt: number;  total_video_15d_cnt: number;
  total_video_30d_cnt: number; total_video_60d_cnt: number; total_video_90d_cnt: number;

  total_live_1d_cnt: number;  total_live_7d_cnt: number;  total_live_15d_cnt: number;
  total_live_30d_cnt: number; total_live_60d_cnt: number; total_live_90d_cnt: number;

  total_views_1d_cnt: number;  total_views_7d_cnt: number;  total_views_15d_cnt: number;
  total_views_30d_cnt: number; total_views_60d_cnt: number; total_views_90d_cnt: number;

  // …also _ifl_video_/_ifl_live_/_video_sale_/_live_sale_ windows; add as needed
  [key: string]: unknown;
}

// Helper for parsing the stringified cover_url JSON array
export interface ProductImage { url: string; index: number }

// ── Influencer (per-product带货达人 row) ─────────────────────────────────────
export interface ProductInfluencer {
  user_id: string;
  nick_name: string;
  avatar: string;
  category: string;
  region: string;
  product_id: string;
  per_product_ifl_gmv_amt: number;
  per_product_ifl_sale_cnt: number;
  total_followers_cnt: number;
  total_following_cnt: number;
  total_digg_cnt: number;
  total_views_cnt: number;
  total_post_video_cnt: number;
  total_live_cnt: number;
  total_live_views_cnt: number;
}

// ── Video (挂车视频 row) ────────────────────────────────────────────────────
export interface ProductVideo {
  video_id: string;
  product_id: string;
  user_id: string;
  region: string;
  create_time: string;       // unix seconds, as string
  duration: number;
  width: string;
  height: string;
  ratio: string;
  data_size: string;
  hash_tag: string;
  play_addr: string;
  reflow_cover: string;
  video_desc: string;
  total_views_cnt: number;
  total_digg_cnt: number;
  total_comments_cnt: number;
  total_shares_cnt: number;
  total_favorites_cnt: number;
  total_video_sale_cnt: number;
  total_video_sale_gmv_amt: number;
}

// ── Seller (店铺 ranklist row) ──────────────────────────────────────────────
export interface SellerListItem {
  seller_id: string;
  seller_name: string;
  user_id: string;
  region: string;
  cover_url: string;          // 防盗链原始 URL，需签名
  rating: number;             // 0..5
  from_flag: number;
  category_id: string;
  category_l2_id: string;
  category_l3_id: string;
  most_product_category_list: string;  // stringified JSON array of {category_name, category_id}
  total_product_cnt: number;
  total_sale_cnt: number;
  total_sale_gmv_amt: number;
  total_ifl_cnt: number;      // # 带货达人
  total_video_cnt: number;
  total_live_cnt: number;
}

// ── Influencer (达人 ranklist row) ──────────────────────────────────────────
export interface InfluencerRankItem {
  user_id: string;
  unique_id: string;          // @handle
  nick_name: string;
  avatar: string;             // 防盗链原始 URL，需签名
  category: string;
  region: string;
  ec_score: number;           // 带货评分 0..10
  sales_flag: number;
  most_category_id: string;
  most_category_l2_id: string;
  most_category_l3_id: string;
  product_category_list: string;
  total_followers_cnt: number;
  total_digg_cnt: number;
  total_product_cnt: number;
  total_post_video_cnt: number;
  total_live_cnt: number;
  total_sale_cnt: number;
  total_sale_gmv_amt: number;
  // 同名 *_history_cnt 字段为生涯累计，按需取用
  [key: string]: unknown;
}

// ── Video (视频 ranklist row) ───────────────────────────────────────────────
export interface VideoRankItem {
  video_id: string;
  user_id: string;
  unique_id: string;
  nick_name: string;
  avatar: string;             // 防盗链原始 URL，需签名
  reflow_cover: string;       // 视频封面，防盗链原始 URL，需签名
  video_desc: string;
  category: string;
  region: string;
  create_time: string;        // unix seconds, as string
  duration: number;           // seconds
  created_by_ai: string;      // "true" | "false"
  sales_flag: number;
  product_category_list: string;
  video_products: string;     // stringified JSON array
  total_views_cnt: number;
  total_digg_cnt: number;
  total_comments_cnt: number;
  total_shares_cnt: number;
  total_favorites_cnt: number;
  total_video_sale_cnt: number;
  total_video_sale_gmv_amt: number;
  [key: string]: unknown;
}

// ── Trend (daily snapshot) ─────────────────────────────────────────────────
export interface ProductTrendPoint {
  dt: string;                 // "YYYY-MM-DD"
  product_id: string;
  spu_avg_price: number;
  total_sale_cnt: number;
  total_sale_gmv_amt: number;
  total_sale_1d_cnt: number;
  total_sale_gmv_1d_amt: number;
  total_ifl_cnt: number;
  total_video_cnt: number;
  total_live_cnt: number;
}
