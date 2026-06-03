import type { PaymentProvider } from "@prisma/client";
import { getWechatPay, isWechatPayConfigured } from "./wechatpay";
import { getAlipay, isAlipayConfigured } from "./alipay";
import type { Payment } from "./types";

export type { Payment, CreateOrderInput, CreateOrderResult, VerifyNotifyInput, VerifyNotifyResult } from "./types";

export function getPayment(provider: PaymentProvider): Payment {
  if (provider === "WECHAT") return getWechatPay();
  if (provider === "ALIPAY") return getAlipay();
  // MOCK：永远走 mock 路径
  return {
    name: "MOCK",
    enabled: true,
    isMock: true,
    async createOrder(input) {
      return {
        qrCodeUrl: `mock://oneclaw/${input.outTradeNo}`,
        raw: { mock: true },
      };
    },
    async verifyNotify() {
      return { ok: false, reason: "mock provider has no real notifications" };
    },
  };
}

export function getEnabledProviders(): Array<{
  provider: PaymentProvider;
  enabled: boolean;
  isMock: boolean;
  cn: string;
}> {
  return [
    {
      provider: "WECHAT",
      enabled: true, // 前端永远显示，真没配 key 走 mock
      isMock: !isWechatPayConfigured(),
      cn: "微信支付",
    },
    {
      provider: "ALIPAY",
      enabled: true,
      isMock: !isAlipayConfigured(),
      cn: "支付宝",
    },
  ];
}
