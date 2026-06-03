import { prisma } from "@/lib/db";
import { computePlanExpiresAt } from "@/lib/pricing";

/**
 * 把一笔订单标记为成功，并把对应工作台的 plan / planExpiresAt 推进。
 * 幂等：重复回调不会重复升级。
 */
export async function settleOrderPaid(opts: {
  outTradeNo: string;
  providerOrderId: string;
  amountCents: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const order = await prisma.paymentOrder.findUnique({
    where: { outTradeNo: opts.outTradeNo },
    include: { workspace: true },
  });
  if (!order) return { ok: false, reason: "order not found" };

  if (order.status === "PAID") return { ok: true, reason: "already paid" };
  if (order.amountCents !== opts.amountCents) {
    // 金额对不上：标记 failed，要求人工核对
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: "FAILED" },
    });
    return { ok: false, reason: "amount mismatch" };
  }

  const period = order.periodMonths as 1 | 3 | 12;
  const nextExpiresAt = computePlanExpiresAt(
    order.workspace.planExpiresAt,
    period,
  );

  await prisma.$transaction([
    prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        providerOrderId: opts.providerOrderId,
        paidAt: new Date(),
      },
    }),
    prisma.workspace.update({
      where: { id: order.workspaceId },
      data: {
        plan: order.plan,
        planExpiresAt: nextExpiresAt,
      },
    }),
  ]);
  return { ok: true };
}
