import { NextRequest } from "next/server";
import { getPayment } from "@/lib/payment";
import { settleOrderPaid } from "@/lib/payment/settle";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k] = v));

    const payment = getPayment("ALIPAY");
    const result = await payment.verifyNotify({ body, headers });
    if (!result.ok) {
      return new Response("failure", { status: 400 });
    }
    if (result.status === "PAID") {
      const settled = await settleOrderPaid({
        outTradeNo: result.outTradeNo,
        providerOrderId: result.providerOrderId,
        amountCents: result.amountCents,
      });
      if (!settled.ok) return new Response("failure", { status: 500 });
    }
    // 支付宝要求纯文本 "success"
    return new Response("success", { status: 200 });
  } catch (e) {
    console.error("[webhook/alipay]", e);
    return new Response("failure", { status: 500 });
  }
}
