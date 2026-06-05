import type {
  ProductListItem,
  SellerListItem,
  InfluencerRankItem,
  VideoRankItem,
} from "./types";

/**
 * 没配置 ECHOTIK 凭证时的 fallback 数据，便于 UI 演示。
 * 数字略加随机抖动，让多次刷新有变化。
 */
const TEMPLATES: Array<Omit<ProductListItem, "region" | "category_l2_id" | "category_l3_id">> = [
  {
    product_id: "mock-juicer-380",
    product_name: "Portable USB Juicer Cup 380ml - Wireless Mini Blender",
    category_id: "601450",
    min_price: 19.99,
    max_price: 32.5,
    spu_avg_price: 24.99,
    product_commission_rate: 0.18,
    total_sale_cnt: 124000,
    total_sale_gmv_amt: 3098000,
    total_ifl_cnt: 1820,
    total_video_cnt: 6420,
    total_live_cnt: 320,
  },
  {
    product_id: "mock-led-strip",
    product_name: "Smart LED Strip Light 5M with App & Music Sync",
    category_id: "601451",
    min_price: 12.99,
    max_price: 28.0,
    spu_avg_price: 17.5,
    product_commission_rate: 0.22,
    total_sale_cnt: 87500,
    total_sale_gmv_amt: 1531250,
    total_ifl_cnt: 942,
    total_video_cnt: 3800,
    total_live_cnt: 140,
  },
  {
    product_id: "mock-pet-fountain",
    product_name: "Cat Water Fountain Automatic 2L with UV Sterilizer",
    category_id: "601452",
    min_price: 29.99,
    max_price: 45.99,
    spu_avg_price: 34.99,
    product_commission_rate: 0.15,
    total_sale_cnt: 62300,
    total_sale_gmv_amt: 2179900,
    total_ifl_cnt: 540,
    total_video_cnt: 2100,
    total_live_cnt: 88,
  },
  {
    product_id: "mock-baby-feeder",
    product_name: "Silicone Baby Fruit Feeder Pacifier 2-in-1 (3 Pack)",
    category_id: "601453",
    min_price: 8.99,
    max_price: 16.99,
    spu_avg_price: 12.49,
    product_commission_rate: 0.2,
    total_sale_cnt: 95600,
    total_sale_gmv_amt: 1193596,
    total_ifl_cnt: 720,
    total_video_cnt: 2900,
    total_live_cnt: 60,
  },
  {
    product_id: "mock-camp-light",
    product_name: "Multifunctional Camping Lantern - Rechargeable",
    category_id: "601454",
    min_price: 15.99,
    max_price: 29.99,
    spu_avg_price: 21.5,
    product_commission_rate: 0.17,
    total_sale_cnt: 41200,
    total_sale_gmv_amt: 885800,
    total_ifl_cnt: 320,
    total_video_cnt: 1180,
    total_live_cnt: 42,
  },
  {
    product_id: "mock-busy-board",
    product_name: "Montessori Busy Board Toddler Sensory Toy",
    category_id: "601455",
    min_price: 22.99,
    max_price: 39.99,
    spu_avg_price: 28.99,
    product_commission_rate: 0.16,
    total_sale_cnt: 35400,
    total_sale_gmv_amt: 1026000,
    total_ifl_cnt: 410,
    total_video_cnt: 1320,
    total_live_cnt: 24,
  },
  {
    product_id: "mock-skin-massager",
    product_name: "Microcurrent Face Massager Beauty Device",
    category_id: "601456",
    min_price: 39.99,
    max_price: 79.99,
    spu_avg_price: 54.99,
    product_commission_rate: 0.24,
    total_sale_cnt: 28900,
    total_sale_gmv_amt: 1589200,
    total_ifl_cnt: 670,
    total_video_cnt: 2400,
    total_live_cnt: 120,
  },
  {
    product_id: "mock-bottle-warmer",
    product_name: "Portable Baby Bottle Warmer USB Rechargeable",
    category_id: "601453",
    min_price: 19.99,
    max_price: 34.99,
    spu_avg_price: 24.5,
    product_commission_rate: 0.19,
    total_sale_cnt: 31800,
    total_sale_gmv_amt: 779100,
    total_ifl_cnt: 280,
    total_video_cnt: 940,
    total_live_cnt: 18,
  },
];

export function mockRanklist(region: string, limit = 10): ProductListItem[] {
  return TEMPLATES.slice(0, limit).map((t) => ({
    ...t,
    region,
    category_l2_id: "",
    category_l3_id: "",
  }));
}

// ── 店铺 / 达人 / 视频 mock（无凭证 / 接口异常时降级演示用）────────────────────

const SELLER_TEMPLATES: Array<Pick<SellerListItem,
  "seller_id" | "seller_name" | "rating" | "total_product_cnt" | "total_sale_cnt" |
  "total_sale_gmv_amt" | "total_ifl_cnt" | "total_video_cnt" | "total_live_cnt" |
  "most_product_category_list">> = [
  { seller_id: "mock-seller-medicube", seller_name: "medicube US Store", rating: 4.6, total_product_cnt: 86, total_sale_cnt: 342300, total_sale_gmv_amt: 9219799, total_ifl_cnt: 1497, total_video_cnt: 9790, total_live_cnt: 180, most_product_category_list: '[{"category_name":"Beauty & Personal Care"}]' },
  { seller_id: "mock-seller-anker", seller_name: "Anker Official", rating: 4.8, total_product_cnt: 142, total_sale_cnt: 210400, total_sale_gmv_amt: 6312000, total_ifl_cnt: 980, total_video_cnt: 5120, total_live_cnt: 96, most_product_category_list: '[{"category_name":"Electronics"}]' },
  { seller_id: "mock-seller-glow", seller_name: "GlowHome Living", rating: 4.4, total_product_cnt: 230, total_sale_cnt: 158900, total_sale_gmv_amt: 2780000, total_ifl_cnt: 642, total_video_cnt: 3410, total_live_cnt: 54, most_product_category_list: '[{"category_name":"Home Supplies"}]' },
  { seller_id: "mock-seller-petjoy", seller_name: "PetJoy Store", rating: 4.5, total_product_cnt: 64, total_sale_cnt: 98700, total_sale_gmv_amt: 1974000, total_ifl_cnt: 410, total_video_cnt: 2200, total_live_cnt: 33, most_product_category_list: '[{"category_name":"Pet Supplies"}]' },
  { seller_id: "mock-seller-fitpro", seller_name: "FitPro Gear", rating: 4.3, total_product_cnt: 51, total_sale_cnt: 72400, total_sale_gmv_amt: 1520000, total_ifl_cnt: 300, total_video_cnt: 1680, total_live_cnt: 21, most_product_category_list: '[{"category_name":"Sports & Outdoor"}]' },
  { seller_id: "mock-seller-kidsland", seller_name: "KidsLand Toys", rating: 4.7, total_product_cnt: 178, total_sale_cnt: 64500, total_sale_gmv_amt: 1290000, total_ifl_cnt: 520, total_video_cnt: 2940, total_live_cnt: 40, most_product_category_list: '[{"category_name":"Toys & Hobbies"}]' },
];

export function mockSellers(region: string, limit = 10): SellerListItem[] {
  return SELLER_TEMPLATES.slice(0, limit).map((t) => ({
    ...t,
    user_id: t.seller_id,
    region,
    cover_url: "",
    from_flag: 1,
    category_id: "",
    category_l2_id: "",
    category_l3_id: "",
  }));
}

const INFLUENCER_TEMPLATES: Array<Pick<InfluencerRankItem,
  "user_id" | "unique_id" | "nick_name" | "category" | "ec_score" |
  "total_followers_cnt" | "total_digg_cnt" | "total_product_cnt" |
  "total_post_video_cnt" | "total_live_cnt" | "total_sale_cnt" | "total_sale_gmv_amt">> = [
  { user_id: "mock-ifl-1", unique_id: "beautybymia", nick_name: "Beauty by Mia", category: "Beauty & Personal Care", ec_score: 9.2, total_followers_cnt: 1280000, total_digg_cnt: 24500000, total_product_cnt: 320, total_post_video_cnt: 410, total_live_cnt: 86, total_sale_cnt: 54200, total_sale_gmv_amt: 1620000 },
  { user_id: "mock-ifl-2", unique_id: "techtomtom", nick_name: "Tech with Tom", category: "Electronics", ec_score: 8.7, total_followers_cnt: 860000, total_digg_cnt: 13200000, total_product_cnt: 180, total_post_video_cnt: 260, total_live_cnt: 40, total_sale_cnt: 31000, total_sale_gmv_amt: 1240000 },
  { user_id: "mock-ifl-3", unique_id: "cozyhomehannah", nick_name: "Cozy Home Hannah", category: "Home Supplies", ec_score: 8.4, total_followers_cnt: 540000, total_digg_cnt: 9800000, total_product_cnt: 240, total_post_video_cnt: 320, total_live_cnt: 28, total_sale_cnt: 22800, total_sale_gmv_amt: 684000 },
  { user_id: "mock-ifl-4", unique_id: "fitwithleo", nick_name: "Fit with Leo", category: "Sports & Outdoor", ec_score: 8.1, total_followers_cnt: 410000, total_digg_cnt: 7600000, total_product_cnt: 96, total_post_video_cnt: 190, total_live_cnt: 18, total_sale_cnt: 15400, total_sale_gmv_amt: 462000 },
  { user_id: "mock-ifl-5", unique_id: "mamaofthree", nick_name: "Mama of Three", category: "Baby & Maternity", ec_score: 7.9, total_followers_cnt: 320000, total_digg_cnt: 5900000, total_product_cnt: 140, total_post_video_cnt: 210, total_live_cnt: 22, total_sale_cnt: 12900, total_sale_gmv_amt: 322500 },
];

export function mockInfluencers(region: string, limit = 10): InfluencerRankItem[] {
  return INFLUENCER_TEMPLATES.slice(0, limit).map((t) => ({
    ...t,
    avatar: "",
    region,
    sales_flag: 0,
    most_category_id: "",
    most_category_l2_id: "",
    most_category_l3_id: "",
    product_category_list: "",
  }));
}

const VIDEO_TEMPLATES: Array<Pick<VideoRankItem,
  "video_id" | "unique_id" | "nick_name" | "video_desc" | "category" | "duration" |
  "total_views_cnt" | "total_digg_cnt" | "total_comments_cnt" | "total_shares_cnt" |
  "total_favorites_cnt" | "total_video_sale_cnt" | "total_video_sale_gmv_amt">> = [
  { video_id: "mock-vid-1", unique_id: "beautybymia", nick_name: "Beauty by Mia", video_desc: "This $24 serum changed my skin in 2 weeks 😳", category: "Beauty & Personal Care", duration: 38, total_views_cnt: 4200000, total_digg_cnt: 312000, total_comments_cnt: 8900, total_shares_cnt: 21000, total_favorites_cnt: 45000, total_video_sale_cnt: 3200, total_video_sale_gmv_amt: 80000 },
  { video_id: "mock-vid-2", unique_id: "techtomtom", nick_name: "Tech with Tom", video_desc: "The fastest charger I've ever tested ⚡", category: "Electronics", duration: 52, total_views_cnt: 2800000, total_digg_cnt: 198000, total_comments_cnt: 6100, total_shares_cnt: 14500, total_favorites_cnt: 28000, total_video_sale_cnt: 1800, total_video_sale_gmv_amt: 54000 },
  { video_id: "mock-vid-3", unique_id: "cozyhomehannah", nick_name: "Cozy Home Hannah", video_desc: "TikTok made me buy this LED strip and wow", category: "Home Supplies", duration: 27, total_views_cnt: 1900000, total_digg_cnt: 142000, total_comments_cnt: 4300, total_shares_cnt: 9800, total_favorites_cnt: 19000, total_video_sale_cnt: 2400, total_video_sale_gmv_amt: 42000 },
  { video_id: "mock-vid-4", unique_id: "petjoyofficial", nick_name: "PetJoy", video_desc: "My cat is obsessed with this water fountain 🐱", category: "Pet Supplies", duration: 44, total_views_cnt: 1300000, total_digg_cnt: 98000, total_comments_cnt: 3100, total_shares_cnt: 7200, total_favorites_cnt: 12500, total_video_sale_cnt: 980, total_video_sale_gmv_amt: 34300 },
  { video_id: "mock-vid-5", unique_id: "fitwithleo", nick_name: "Fit with Leo", video_desc: "5-min home workout, no equipment needed", category: "Sports & Outdoor", duration: 61, total_views_cnt: 890000, total_digg_cnt: 67000, total_comments_cnt: 2200, total_shares_cnt: 5400, total_favorites_cnt: 9100, total_video_sale_cnt: 420, total_video_sale_gmv_amt: 12600 },
];

export function mockVideos(region: string, limit = 10): VideoRankItem[] {
  return VIDEO_TEMPLATES.slice(0, limit).map((t) => ({
    ...t,
    user_id: t.video_id,
    avatar: "",
    reflow_cover: "",
    region,
    create_time: "1780000000",
    created_by_ai: "false",
    sales_flag: 0,
    product_category_list: "[]",
    video_products: "[]",
  }));
}
