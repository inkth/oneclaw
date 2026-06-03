import type { Payment } from "./types";

/**
 * 微信支付 V3 NATIVE（PC 扫码）。
 *
 * 必需 env：
 *   WECHATPAY_APP_ID
 *   WECHATPAY_MCH_ID
 *   WECHATPAY_API_V3_KEY        // APIv3 密钥
 *   WECHATPAY_PRIVATE_KEY        // 商户 API 私钥（PEM，注意保留换行）
 *   WECHATPAY_SERIAL_NO          // 商户证书序列号
 *
 * 缺一个就会 enabled=false，前端自动隐藏微信支付按钮，dev 下走 mock。
 */
export function isWechatPayConfigured(): boolean {
  return Boolean(
    process.env.WECHATPAY_APP_ID &&
      process.env.WECHATPAY_MCH_ID &&
      process.env.WECHATPAY_API_V3_KEY &&
      process.env.WECHATPAY_PRIVATE_KEY &&
      process.env.WECHATPAY_SERIAL_NO,
  );
}

export function getWechatPay(): Payment {
  const enabled = isWechatPayConfigured();
  return {
    name: "WECHAT",
    enabled,
    isMock: !enabled,
    async createOrder(input) {
      if (!enabled) {
        // mock：返回一个伪 URL，前端展示二维码，配合 mock-confirm 模拟回调
        return {
          qrCodeUrl: `mock://wechatpay/${input.outTradeNo}`,
          providerOrderId: undefined,
          raw: { mock: true },
        };
      }
      const { default: WxPay } = await import("wechatpay-node-v3");
      const pay = new WxPay({
        appid: process.env.WECHATPAY_APP_ID!,
        mchid: process.env.WECHATPAY_MCH_ID!,
        publicKey: Buffer.from(process.env.WECHATPAY_PRIVATE_KEY!),
        privateKey: Buffer.from(process.env.WECHATPAY_PRIVATE_KEY!),
        key: process.env.WECHATPAY_API_V3_KEY!,
      });

      const result = await pay.transactions_native({
        description: input.description,
        out_trade_no: input.outTradeNo,
        notify_url: input.notifyUrl,
        amount: {
          total: input.amountCents,
          currency: "CNY",
        },
        time_expire: input.expiresAt.toISOString(),
      } as Parameters<typeof pay.transactions_native>[0]);

      const data = result as { code_url?: string; status?: number; message?: string };
      if (!data.code_url) {
        throw new Error(`微信下单失败：${data.message ?? data.status ?? "no code_url"}`);
      }
      return {
        qrCodeUrl: data.code_url,
        raw: data,
      };
    },
    async verifyNotify(input) {
      if (!enabled) {
        return { ok: false, reason: "wechatpay not configured" };
      }
      try {
        const { default: WxPay } = await import("wechatpay-node-v3");
        const pay = new WxPay({
          appid: process.env.WECHATPAY_APP_ID!,
          mchid: process.env.WECHATPAY_MCH_ID!,
          publicKey: Buffer.from(process.env.WECHATPAY_PRIVATE_KEY!),
          privateKey: Buffer.from(process.env.WECHATPAY_PRIVATE_KEY!),
          key: process.env.WECHATPAY_API_V3_KEY!,
        });
        // wechatpay-node-v3 暴露的 decipher_gcm 解密 resource.ciphertext
        const payload = JSON.parse(input.body) as {
          resource?: {
            ciphertext?: string;
            nonce?: string;
            associated_data?: string;
          };
        };
        const r = payload.resource;
        if (!r?.ciphertext || !r.nonce) {
          return { ok: false, reason: "missing resource fields" };
        }
        const decrypted = pay.decipher_gcm<{
          out_trade_no: string;
          transaction_id: string;
          trade_state: string;
          amount?: { total: number };
        }>(r.ciphertext, r.associated_data ?? "", r.nonce);

        const status =
          decrypted.trade_state === "SUCCESS"
            ? "PAID"
            : decrypted.trade_state === "REFUND"
              ? "REFUNDED"
              : "FAILED";
        return {
          ok: true,
          outTradeNo: decrypted.out_trade_no,
          providerOrderId: decrypted.transaction_id,
          amountCents: decrypted.amount?.total ?? 0,
          status,
        };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
      }
    },
  };
}
