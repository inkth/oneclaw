/**
 * 积分单价表 —— 镜像后端 server/internal/model/billing.go 的 usageCreditCost。
 * 单数值,改价同时改这两处即可。动作处「≈ X 积分」标识从这里取值。
 */
export const CREDIT_COST = {
  agentTask: 5, // 选品分析 / Listing / 复盘
  video: 50, // 出片(短视频)
  image: 2, // 出图(每张)
} as const;
