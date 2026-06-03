/**
 * 腾讯云 SMS 适配层。
 *
 * 没配齐 env 时走 console fallback（打印验证码到 dev terminal），
 * 配齐后自动走腾讯云国内短信。
 *
 * env：
 *   TENCENT_SECRET_ID
 *   TENCENT_SECRET_KEY
 *   TENCENT_SMS_SDK_APP_ID    // SDK AppID，腾讯云控制台获取
 *   TENCENT_SMS_SIGN_NAME     // 短信签名（含「【】」括号本身）
 *   TENCENT_SMS_TEMPLATE_ID   // 验证码模板 ID，需含 1 个变量 = 验证码
 *   TENCENT_SMS_REGION        // 可选，默认 ap-guangzhou
 */

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TENCENT_SECRET_ID &&
      process.env.TENCENT_SECRET_KEY &&
      process.env.TENCENT_SMS_SDK_APP_ID &&
      process.env.TENCENT_SMS_TEMPLATE_ID &&
      process.env.TENCENT_SMS_SIGN_NAME,
  );
}

export type SmsResult = { ok: boolean; reason?: string };

/**
 * 给一个 11 位国内手机号发送验证码。
 * 不做 rate limit、不做格式校验——调用方自己 gate。
 */
export async function sendVerificationCode(
  phone: string,
  code: string,
): Promise<SmsResult> {
  if (!isSmsConfigured()) {
    // dev fallback
    console.log("[sms] (dev fallback)");
    console.log(`  phone: ${phone}`);
    console.log(`  code:  ${code}  (5 min)`);
    return { ok: true, reason: "console-fallback" };
  }

  try {
    // 动态 import 避免没装 SDK 时类型/导入炸
    const { sms } = await import("tencentcloud-sdk-nodejs-sms");
    const Client = sms.v20210111.Client;
    const client = new Client({
      credential: {
        secretId: process.env.TENCENT_SECRET_ID!,
        secretKey: process.env.TENCENT_SECRET_KEY!,
      },
      region: process.env.TENCENT_SMS_REGION || "ap-guangzhou",
      profile: { httpProfile: { reqTimeout: 10 } },
    });

    const params = {
      SmsSdkAppId: process.env.TENCENT_SMS_SDK_APP_ID!,
      SignName: process.env.TENCENT_SMS_SIGN_NAME!,
      TemplateId: process.env.TENCENT_SMS_TEMPLATE_ID!,
      TemplateParamSet: [code],
      PhoneNumberSet: [`+86${phone}`],
    };
    const resp = await client.SendSms(params);
    const status = resp.SendStatusSet?.[0];
    if (status?.Code === "Ok") return { ok: true };
    return { ok: false, reason: status?.Message || "unknown sms error" };
  } catch (e) {
    console.error("[sms] tencent send failed", e);
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}
