import type { Plan, PaymentProvider } from "@prisma/client";

export type CreateOrderInput = {
  outTradeNo: string;
  amountCents: number;
  description: string;
  notifyUrl: string;
  expiresAt: Date;
};

export type CreateOrderResult = {
  qrCodeUrl: string; // 二维码内容（前端转 QR），微信是 code_url，支付宝是 qr_code
  providerOrderId?: string; // 微信 prepay_id 或 支付宝 trade_no
  raw?: unknown;
};

export type VerifyNotifyInput = {
  body: string;
  headers: Record<string, string>;
};

export type VerifyNotifyResult =
  | {
      ok: true;
      outTradeNo: string;
      providerOrderId: string;
      amountCents: number;
      status: "PAID" | "FAILED" | "REFUNDED";
    }
  | { ok: false; reason: string };

export type Payment = {
  name: PaymentProvider;
  enabled: boolean;
  isMock: boolean;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifyNotify(input: VerifyNotifyInput): Promise<VerifyNotifyResult>;
};

export type PlanPurchase = {
  plan: Plan;
  periodMonths: 1 | 3 | 12;
};
