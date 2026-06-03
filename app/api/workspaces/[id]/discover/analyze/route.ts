import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { assertCanDispatchTask } from "@/lib/quota";
import { toAnalystFacts } from "@/lib/echotik/transform";
import { mockRanklist } from "@/lib/echotik/mock";
import { isEchoTikConfigured } from "@/lib/echotik/safe";
import { getProductDetail } from "@/lib/echotik/client";
import { getDiscoverProduct } from "@/lib/echotik/cache";
import { chat, extractJson } from "@/lib/agents/llm";
import type { ProductListItem } from "@/lib/echotik/types";

export const maxDuration = 60;

const schema = z.object({
  productId: z.string().min(1),
  region: z.enum(["US", "GB", "ID", "TH", "VN", "MY"]),
});

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

const SYSTEM = `你是 OneClaw 的"市场分析师 Agent"，专门基于 EchoTik 真实销售数据做出海商品可行性分析。

**给你的事实块全部是 TikTok Shop 真实数据**，请直接基于这些数字推理，**不要瞎编更多数字**。

输出严格 JSON：
{
  "verdict": "RECOMMENDED" | "EVALUATING" | "AVOID",
  "verdictReason": "30 字以内的判断理由",
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "risks": ["风险1", "风险2"],
  "targetAudience": "目标人群一句话描述",
  "videoAngles": ["建议短视频角度1", "角度2", "角度3"],
  "roiEstimate": "毛估 ROI / 利润空间一句话"
}

要求：
- verdict 严格三选一
- sellingPoints / risks 各 2-3 条，每条不超过 25 字
- videoAngles 3 条，对应可拍的差异化方向
- 全部 JSON，**不要 markdown 包裹也不要解释文字**`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const rl = await rateLimit({
      key: `discover-analyze:${id}`,
      limit: 60,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("分析过于频繁", 429);

    const quotaCheck = await assertCanDispatchTask(id);
    if (!quotaCheck.ok) {
      return fail(quotaCheck.reason, 402, { quota: quotaCheck.quota });
    }

    const body = await req.json();
    const { productId, region } = schema.parse(body);

    // 优先本地 → detail → mock
    const dp = await getDiscoverProduct(productId, region);
    let source: ProductListItem | null = dp
      ? {
          product_id: dp.externalId,
          product_name: dp.name,
          region: dp.region,
          category_id: dp.categoryId ?? "",
          category_l2_id: dp.categoryL2Id ?? "",
          category_l3_id: dp.categoryL3Id ?? "",
          min_price: dp.minPriceCents / 100,
          max_price: dp.maxPriceCents / 100,
          spu_avg_price: dp.avgPriceCents / 100,
          product_commission_rate: dp.commissionRate,
          total_sale_cnt: dp.totalSaleCnt,
          total_sale_gmv_amt: dp.totalSaleGmvCents / 100,
          total_ifl_cnt: dp.totalIflCnt,
          total_video_cnt: dp.totalVideoCnt,
          total_live_cnt: dp.totalLiveCnt,
        }
      : null;

    if (!source && isEchoTikConfigured()) {
      try {
        source = await getProductDetail(productId, region);
      } catch (e) {
        console.error("[discover/analyze] EchoTik detail failed", e);
      }
    }
    if (!source) {
      source = mockRanklist(region, 16).find((p) => p.product_id === productId) ?? null;
    }
    if (!source) return fail("找不到该商品", 404);

    const task = await prisma.agentTask.create({
      data: {
        workspaceId: id,
        agent: "ANALYST",
        input: `[Discover · ${region}] ${source.product_name}`,
        status: "QUEUED",
        metadata: {
          source: "discover.echotik",
          productId: source.product_id,
          discoverProductId: dp?.id ?? null,
          region,
        },
      },
    });

    after(async () => {
      try {
        await prisma.agentTask.update({
          where: { id: task.id },
          data: { status: "RUNNING", startedAt: new Date() },
        });
        const facts = toAnalystFacts(source);
        const { content, usage } = await chat({
          system: SYSTEM,
          user: facts,
          json: true,
          maxTokens: 1500,
        });
        const parsed = extractJson<{
          verdict: "RECOMMENDED" | "EVALUATING" | "AVOID";
          verdictReason: string;
          sellingPoints: string[];
          risks: string[];
          targetAudience: string;
          videoAngles: string[];
          roiEstimate: string;
        }>(content);

        const output = [
          `🔎 ${source.product_name}`,
          "",
          `判断：${parsed.verdict === "RECOMMENDED" ? "⭐ 推荐做" : parsed.verdict === "AVOID" ? "❌ 不建议" : "🟡 观望"} — ${parsed.verdictReason}`,
          "",
          `卖点：`,
          ...parsed.sellingPoints.map((s) => `  · ${s}`),
          "",
          `风险：`,
          ...parsed.risks.map((s) => `  · ${s}`),
          "",
          `目标人群：${parsed.targetAudience}`,
          "",
          `内容方向：`,
          ...parsed.videoAngles.map((s, i) => `  ${i + 1}. ${s}`),
          "",
          `毛估 ROI：${parsed.roiEstimate}`,
        ].join("\n");

        await prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: "DONE",
            output,
            metadata: {
              source: "discover.echotik",
              productId: source!.product_id,
              discoverProductId: dp?.id ?? null,
              region,
              ...parsed,
            },
            model: usage.model,
            tokensIn: usage.tokensIn,
            tokensOut: usage.tokensOut,
            costCents: usage.costCents,
            finishedAt: new Date(),
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: "FAILED",
            errorMessage: msg,
            output: `❌ 分析失败：${msg}`,
            finishedAt: new Date(),
          },
        });
      }
    });

    return ok({ task }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}
