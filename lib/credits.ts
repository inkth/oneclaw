/**
 * 积分单价表 —— 镜像后端 server/internal/model/billing.go 的 usageCreditCost。
 * 单数值,改价同时改这两处即可。动作处「≈ X 积分」标识从这里取值。
 */
export const CREDIT_COST = {
  agentTask: 3, // 选品 / 短视频脚本 / Listing / 试穿 / 复盘 AI 深挖(各一次)
  video: 175, // 出片(短视频)
  image: 6, // 出图(每张)
} as const;
