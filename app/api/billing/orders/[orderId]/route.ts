import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { orderId } = await params;

    const order = await prisma.paymentOrder.findFirst({
      where: { id: orderId, userId: session.user.id },
    });
    if (!order) return fail("订单不存在", 404);

    // 自动把过期未支付订单标记为 EXPIRED（懒清理）
    if (order.status === "PENDING" && order.expiresAt.getTime() < Date.now()) {
      const updated = await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: "EXPIRED" },
      });
      return ok({ order: updated });
    }

    return ok({ order });
  } catch (err) {
    return handleError(err);
  }
}
