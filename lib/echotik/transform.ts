/**
 * 把 EchoTik 商品数据转成 OneClaw 内部 Product 行 / Agent 分析输入。
 */
import type { ProductListItem, ProductDetail } from "./types";

const EMOJI_BY_KEYWORD: Array<[RegExp, string]> = [
  [/juic|drink|beverage|cup|bottle/i, "🥤"],
  [/baby|infant|toddler|kid|crib/i, "🍼"],
  [/pet|dog|cat/i, "🐕"],
  [/beauty|skin|makeup|cosmetic|lipstick|mask/i, "💄"],
  [/phone|case|charger|cable|usb/i, "📱"],
  [/camp|outdoor|tent|hiking/i, "🏕️"],
  [/light|lamp|led/i, "💡"],
  [/clean|wash|laundry/i, "🧼"],
  [/kitchen|cook|chef|knife|pan/i, "🍳"],
  [/fashion|cloth|shirt|dress|sock/i, "👕"],
  [/toy|game|play/i, "🧸"],
  [/sport|fitness|gym|yoga/i, "🏋️"],
  [/headphone|earbud|audio|speaker/i, "🎧"],
  [/garden|plant|flower/i, "🪴"],
];

function guessEmoji(name: string): string {
  for (const [re, e] of EMOJI_BY_KEYWORD) if (re.test(name)) return e;
  return "📦";
}

/**
 * 把 EchoTik 行转为给 Analyst 用的"事实块"，让 LLM 不用瞎编。
 */
export function toAnalystFacts(p: ProductListItem | ProductDetail): string {
  const lines = [
    `商品：${p.product_name}`,
    `区域：${p.region}`,
    `平均价：$${p.spu_avg_price.toFixed(2)}（区间 $${p.min_price.toFixed(2)} ~ $${p.max_price.toFixed(2)}）`,
    `佣金率：${(p.product_commission_rate * 100).toFixed(1)}%`,
    `总销量：${p.total_sale_cnt.toLocaleString()}`,
    `总 GMV：$${p.total_sale_gmv_amt.toLocaleString()}`,
    `带货达人：${p.total_ifl_cnt.toLocaleString()} 名`,
    `挂车视频：${p.total_video_cnt.toLocaleString()} 条`,
    `挂车直播：${p.total_live_cnt.toLocaleString()} 场`,
  ];
  if ("total_sale_7d_cnt" in p) {
    const d = p as ProductDetail;
    lines.push(`近 7 天销量：${d.total_sale_7d_cnt.toLocaleString()}`);
    lines.push(`近 7 天 GMV：$${d.total_sale_gmv_7d_amt.toLocaleString()}`);
    lines.push(`产品评分：${d.product_rating} （${d.review_count.toLocaleString()} 条评论）`);
  }
  return lines.join("\n");
}

/**
 * 估算毛利率：默认假设采购成本是售价 25%（无更多数据时的保守估计）。
 * 真实落库时可以让用户编辑。
 */
function estimateCostCents(priceCents: number): number {
  return Math.round(priceCents * 0.25);
}

function estimateMarginPct(priceCents: number, costCents: number): number {
  if (priceCents <= 0) return 0;
  return Math.round(((priceCents - costCents) / priceCents) * 100);
}

/**
 * EchoTik 商品 → OneClaw Product create data。
 */
export function toProductCreate(opts: {
  workspaceId: string;
  product: ProductListItem;
  categoryLabel?: string;
}): import("@prisma/client").Prisma.ProductUncheckedCreateInput {
  const p = opts.product;
  const priceCents = Math.round(p.spu_avg_price * 100);
  const costCents = estimateCostCents(priceCents);
  const marginPct = estimateMarginPct(priceCents, costCents);

  // ROI 评分：按销量 / GMV / 达人覆盖 做粗略加权（0-100）
  const salesScore = Math.min(100, Math.round(Math.log10(Math.max(1, p.total_sale_cnt)) * 22));
  const iflScore = Math.min(100, Math.round(Math.log10(Math.max(1, p.total_ifl_cnt)) * 25));
  const roiScore = Math.round((salesScore + iflScore) / 2);

  return {
    workspaceId: opts.workspaceId,
    title: p.product_name,
    category: opts.categoryLabel ?? "TikTok Shop 爆品",
    emoji: guessEmoji(p.product_name),
    priceCents,
    costCents,
    marginPct,
    roiScore,
    monthlySales: p.total_sale_cnt,
    trendDelta: 0, // 这里没拿到日数据；之后让 Analyst 在分析时补
    status: "EVALUATING",
    note: `来自 EchoTik · 区域 ${p.region} · ${p.total_ifl_cnt.toLocaleString()} 个达人在带 · ${p.total_video_cnt.toLocaleString()} 条挂车视频`,
  };
}
