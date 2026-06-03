import { NextRequest } from "next/server";
import { getProductRanklist } from "@/lib/echotik/client";
import { persistRanklist, enrichCoversIfMissing } from "@/lib/echotik/cache";
import { isEchoTikConfigured } from "@/lib/echotik/safe";
import { ok, fail } from "@/lib/api";
import type { Region, RankType, RankField } from "@/lib/echotik/types";

export const maxDuration = 60;

const REGIONS: Region[] = ["US", "GB", "ID", "TH", "VN", "MY"];
// MVP：每个区域只刷热销×销量（最有信号的一组）。
// 后期可扩展到 region × rank_type × rank_field 完整 6×3×3=54 个组合。
const COMBOS: Array<{ rankType: RankType; rankField: RankField }> = [
  { rankType: 1, rankField: 1 },
];

function authorized(req: NextRequest): boolean {
  // Vercel Cron 会自动注入 Authorization: Bearer <CRON_SECRET>
  // 我们也接受手动 ?secret= 参数 / x-cron-secret header 方便调试。
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // 没配 CRON_SECRET 时本地 dev 默认放行
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${expected}`) return true;
  if (req.headers.get("x-cron-secret") === expected) return true;
  if (new URL(req.url).searchParams.get("secret") === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return fail("unauthorized", 401);
  if (!isEchoTikConfigured()) return fail("EchoTik 未配置", 503);

  const startedAt = Date.now();
  const summary: Array<{
    region: Region;
    rankType: number;
    rankField: number;
    rows: number;
    elapsedMs: number;
    error?: string;
  }> = [];

  for (const region of REGIONS) {
    for (const combo of COMBOS) {
      const t0 = Date.now();
      try {
        const list = await getProductRanklist({
          region,
          rank_type: combo.rankType,
          product_rank_field: combo.rankField,
          page_size: 20,
        });
        if (list.length > 0) {
          await persistRanklist({
            region,
            rankType: combo.rankType,
            rankField: combo.rankField,
            date: new Date().toISOString().slice(0, 10),
            products: list,
          });
          // 同步把新进来的 cover 也补上（不太久）
          await enrichCoversIfMissing(
            list.map((p) => p.product_id),
            region,
          );
        }
        summary.push({
          region,
          rankType: combo.rankType,
          rankField: combo.rankField,
          rows: list.length,
          elapsedMs: Date.now() - t0,
        });
      } catch (e) {
        summary.push({
          region,
          rankType: combo.rankType,
          rankField: combo.rankField,
          rows: 0,
          elapsedMs: Date.now() - t0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return ok({
    totalElapsedMs: Date.now() - startedAt,
    summary,
  });
}
