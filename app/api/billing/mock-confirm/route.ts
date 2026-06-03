import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";
import { settleOrderPaid } from "@/lib/payment/settle";

/**
 * 仅 dev / mock 路径使用：当 wechatpay/alipay 没配 key 时，前端无法收到真实回调，
 * 这里允许下单本人模拟"已支付"，便于打通 UI/工作台升级流程。
 *
 * 安全：
 * - 只能本人确认自己的订单
 * - 订单 provider 必须是 mock（即对应 driver 没配 key）
 */

const schema = z.object({ orderId: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const body = await req.json();
    const { orderId } = schema.parse(body);

    const order = await prisma.paymentOrder.findFirst({
      where: { id: orderId, userId: session.user.id },
    });
    if (!order) return fail("订单不存在", 404);
    if (order.status === "PAID") return ok({ alreadyPaid: true });
    if (order.status !== "PENDING") return fail(`订单状态：${order.status}`, 400);

    // 只允许 mock：判定 qrCodeUrl 是 mock:// 开头
    if (!order.qrCodeUrl?.startsWith("mock://")) {
      return fail("该订单非 mock 订单，请走真实支付回调", 400);
    }

    const settled = await settleOrderPaid({
      outTradeNo: order.outTradeNo,
      providerOrderId: `MOCK-${order.id}`,
      amountCents: order.amountCents,
    });
    if (!settled.ok) return fail(`结算失败：${settled.reason}`, 500);
    return ok({ settled: true });
  } catch (err) {
    return handleError(err);
  }
}
