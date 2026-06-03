import { NextRequest, NextResponse } from "next/server";
import { getPayment } from "@/lib/payment";
import { settleOrderPaid } from "@/lib/payment/settle";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k] = v));

    const payment = getPayment("WECHAT");
    const result = await payment.verifyNotify({ body, headers });
    if (!result.ok) {
      return NextResponse.json(
        { code: "FAIL", message: result.reason },
        { status: 400 },
      );
    }

    if (result.status === "PAID") {
      const settled = await settleOrderPaid({
        outTradeNo: result.outTradeNo,
        providerOrderId: result.providerOrderId,
        amountCents: result.amountCents,
      });
      if (!settled.ok) {
        return NextResponse.json(
          { code: "FAIL", message: settled.reason },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({ code: "SUCCESS", message: "OK" });
  } catch (e) {
    console.error("[webhook/wechatpay]", e);
    return NextResponse.json(
      { code: "FAIL", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
