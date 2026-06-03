import type { Payment } from "./types";

/**
 * 支付宝 PC 扫码（alipay.trade.precreate）。
 *
 * 必需 env：
 *   ALIPAY_APP_ID
 *   ALIPAY_PRIVATE_KEY    // 应用私钥（PEM 或纯 base64）
 *   ALIPAY_PUBLIC_KEY     // 支付宝公钥（PEM 或纯 base64）
 *
 * 缺任一个 enabled=false，dev 下走 mock。
 */
export function isAlipayConfigured(): boolean {
  return Boolean(
    process.env.ALIPAY_APP_ID &&
      process.env.ALIPAY_PRIVATE_KEY &&
      process.env.ALIPAY_PUBLIC_KEY,
  );
}

export function getAlipay(): Payment {
  const enabled = isAlipayConfigured();
  return {
    name: "ALIPAY",
    enabled,
    isMock: !enabled,
    async createOrder(input) {
      if (!enabled) {
        return {
          qrCodeUrl: `mock://alipay/${input.outTradeNo}`,
          providerOrderId: undefined,
          raw: { mock: true },
        };
      }
      const AlipayModule = await import("alipay-sdk");
      const AlipaySdk = (AlipayModule as unknown as { AlipaySdk?: typeof import("alipay-sdk").AlipaySdk; default?: typeof import("alipay-sdk").AlipaySdk }).AlipaySdk ?? (AlipayModule as unknown as { default: typeof import("alipay-sdk").AlipaySdk }).default;
      const sdk = new AlipaySdk({
        appId: process.env.ALIPAY_APP_ID!,
        privateKey: process.env.ALIPAY_PRIVATE_KEY!,
        alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY!,
        signType: "RSA2",
      });

      const result = (await sdk.exec("alipay.trade.precreate", {
        notifyUrl: input.notifyUrl,
        bizContent: {
          out_trade_no: input.outTradeNo,
          total_amount: (input.amountCents / 100).toFixed(2),
          subject: input.description,
          timeout_express: "30m",
        },
      })) as { code?: string; qrCode?: string; msg?: string };

      if (result.code !== "10000" || !result.qrCode) {
        throw new Error(`支付宝下单失败：${result.msg ?? result.code}`);
      }
      return {
        qrCodeUrl: result.qrCode,
        raw: result,
      };
    },
    async verifyNotify(input) {
      if (!enabled) {
        return { ok: false, reason: "alipay not configured" };
      }
      try {
        const AlipayModule = await import("alipay-sdk");
        const AlipaySdk = (AlipayModule as unknown as { AlipaySdk?: typeof import("alipay-sdk").AlipaySdk; default?: typeof import("alipay-sdk").AlipaySdk }).AlipaySdk ?? (AlipayModule as unknown as { default: typeof import("alipay-sdk").AlipaySdk }).default;
        const sdk = new AlipaySdk({
          appId: process.env.ALIPAY_APP_ID!,
          privateKey: process.env.ALIPAY_PRIVATE_KEY!,
          alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY!,
          signType: "RSA2",
        });
        // 支付宝异步通知是表单格式
        const params = Object.fromEntries(new URLSearchParams(input.body));
        const valid = sdk.checkNotifySign(params);
        if (!valid) return { ok: false, reason: "invalid signature" };

        const status =
          params.trade_status === "TRADE_SUCCESS" ||
          params.trade_status === "TRADE_FINISHED"
            ? "PAID"
            : params.trade_status === "TRADE_CLOSED"
              ? "FAILED"
              : "FAILED";

        const cents = Math.round(parseFloat(params.total_amount ?? "0") * 100);

        return {
          ok: true,
          outTradeNo: params.out_trade_no,
          providerOrderId: params.trade_no,
          amountCents: cents,
          status,
        };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
      }
    },
  };
}
