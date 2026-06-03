import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { priceFor, PERIODS, isPayablePlan } from "@/lib/pricing";
import { getPayment } from "@/lib/payment";

const schema = z.object({
  plan: z.enum(["PRO", "TEAM"]),
  periodMonths: z.union([z.literal(1), z.literal(3), z.literal(12)]),
  provider: z.enum(["WECHAT", "ALIPAY"]),
});

function newOutTradeNo(): string {
  // 32 位以内：oneclaw + 时间戳 + 8 字节 hex = 7+13+16=36 → 截到 32
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString("hex");
  return `OC${ts}${rand}`.slice(0, 32).toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);

    const rl = await rateLimit({
      key: `checkout:${session.user.id}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("下单过于频繁，请稍后再试", 429);

    const body = await req.json();
    const { plan, periodMonths, provider } = schema.parse(body);
    if (!isPayablePlan(plan)) return fail("无效方案", 400);
    if (!PERIODS.includes(periodMonths)) return fail("无效周期", 400);

    const workspace = await getOrCreateDefaultWorkspace(session.user.id);
    const amountCents = priceFor(plan, periodMonths);
    const outTradeNo = newOutTradeNo();
    const expiresAt = new Date(Date.now() + 30 * 60_000); // 二维码 30 min 有效

    const order = await prisma.paymentOrder.create({
      data: {
        workspaceId: workspace.id,
        userId: session.user.id,
        outTradeNo,
        provider,
        plan,
        periodMonths,
        amountCents,
        expiresAt,
      },
    });

    const base = process.env.AUTH_URL ?? "http://localhost:3000";
    const payment = getPayment(provider);
    const result = await payment.createOrder({
      outTradeNo,
      amountCents,
      description: `OneClaw ${plan} ${periodMonths}个月订阅`,
      notifyUrl: `${base}/api/webhooks/${provider === "WECHAT" ? "wechatpay" : "alipay"}`,
      expiresAt,
    });

    const updated = await prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        qrCodeUrl: result.qrCodeUrl,
        providerOrderId: result.providerOrderId,
        rawResponse: (result.raw as object | undefined) ?? undefined,
      },
    });

    return ok({
      order: {
        id: updated.id,
        outTradeNo: updated.outTradeNo,
        amountCents: updated.amountCents,
        plan: updated.plan,
        periodMonths: updated.periodMonths,
        provider: updated.provider,
        qrCodeUrl: updated.qrCodeUrl,
        expiresAt: updated.expiresAt,
        status: updated.status,
      },
      isMock: payment.isMock,
    });
  } catch (err) {
    return handleError(err);
  }
}
