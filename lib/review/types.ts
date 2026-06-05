// 复盘引擎的输入/输出类型。后端负责全部计算，前端只渲染这些结构。

/** 一条归一化后的广告创意/视频指标行（来自 GMVMax / Creative Hub 报表）。 */
export interface MetricRow {
  videoId: string; // Video ID / Creative ID
  title: string; // 视频标题（可空时回退为 videoId）
  creator?: string; // 达人账号
  cost: number; // 消耗 / 广告花费
  gmv: number; // 成交金额 Gross Revenue
  roi: number; // 投产比（缺失时由 gmv/cost 推导）
  impressions: number; // 曝光
  clicks: number; // 点击
  orders: number; // SKU 订单
  ctr: number; // 点击率 0..1（缺失时由 clicks/impressions 推导）
  cvr: number; // 转化率 0..1（缺失时由 orders/clicks 推导）
  view2s?: number; // 2s 完播率 0..1
  view6s?: number; // 6s 完播率 0..1
  view100?: number; // 完播率 0..1
}

/** Cost×ROI 四象限。 */
export type Quadrant = "winner" | "potential" | "bleeder" | "longtail";

export const QUADRANT_META: Record<
  Quadrant,
  { name: string; en: string; cond: string; strategy: string; tone: string }
> = {
  winner: {
    name: "明星素材",
    en: "Winners",
    cond: "高消耗 · 高 ROI",
    strategy: "交给系统自动跑，或手动加推扩量",
    tone: "success",
  },
  potential: {
    name: "潜力素材",
    en: "Potentials",
    cond: "低消耗 · 高 ROI",
    strategy: "被系统忽视的遗珠，复制计划单独放量测试",
    tone: "info",
  },
  bleeder: {
    name: "浪费素材",
    en: "Bleeders",
    cond: "高消耗 · 低 ROI",
    strategy: "立即关停或降权——复盘第一优先级",
    tone: "danger",
  },
  longtail: {
    name: "长尾素材",
    en: "Others",
    cond: "低消耗 · 低 ROI",
    strategy: "样本太小、暂无统计意义，忽略",
    tone: "neutral",
  },
};

export interface QuadrantItem {
  videoId: string;
  title: string;
  creator?: string;
  cost: number;
  gmv: number;
  roi: number;
  ctr: number;
  cvr: number;
  orders: number;
  quadrant: Quadrant;
}

/** 大盘健康度基线。 */
export interface Baseline {
  rowCount: number;
  totalCost: number;
  totalGmv: number;
  roi: number;
  avgCtr: number; // 加权 0..1
  avgCvr: number; // 加权 0..1
  avgView2s: number | null; // 0..1，无数据则 null
  targetRoi: number;
  costThreshold: number; // 高/低消耗分界（中位数）
}

export type Priority = "P0" | "P1" | "P2";

/** 优化行动清单的一条。 */
export interface ActionItem {
  videoId: string;
  title: string;
  quadrant: Quadrant;
  problem: string; // 当前问题
  action: string; // 建议操作
  priority: Priority;
}

export interface ReviewResult {
  baseline: Baseline;
  counts: Record<Quadrant, number>;
  /** 每个象限的代表样本（按消耗降序，最多若干条）。 */
  quadrants: Record<Quadrant, QuadrantItem[]>;
  actions: ActionItem[];
  geminiPrompt: string;
  warnings: string[];
}
