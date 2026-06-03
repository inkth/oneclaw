/**
 * 邮件发送：默认 dev 模式打印到 console；
 * 配 RESEND_API_KEY 时走 Resend（https://resend.com）。
 *
 * 用法：
 *   await sendEmail({
 *     to: "user@example.com",
 *     subject: "重置密码",
 *     html: "<p>...</p>",
 *   });
 */

const FROM = process.env.EMAIL_FROM ?? "OneClaw <onboarding@resend.dev>";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // dev 模式：打印到 console，便于本地调试
    console.log("[email] (dev fallback)");
    console.log(`  to: ${input.to}`);
    console.log(`  subject: ${input.subject}`);
    console.log(`  body: ${input.text ?? input.html.replace(/<[^>]+>/g, "")}`);
    return { ok: true, reason: "console-fallback" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[email] resend failed", res.status, t);
      return { ok: false, reason: `resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] error", e);
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

// --- 邮件模板 ---

const baseStyle = `
font-family: -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;
max-width: 480px; margin: 0 auto; padding: 32px 24px;
color: #18181b; line-height: 1.6;
`;

const buttonStyle = `
display: inline-block; padding: 12px 24px; border-radius: 999px;
background: linear-gradient(135deg, #4f46e5, #7c3aed);
color: white; text-decoration: none; font-weight: 600; font-size: 14px;
`;

export function passwordResetEmail(name: string | null, link: string): { subject: string; html: string; text: string } {
  return {
    subject: "OneClaw · 重置你的密码",
    text: `你好${name ? " " + name : ""}，\n\n你（或别人）请求重置 OneClaw 账户密码。点击链接重置：\n\n${link}\n\n链接 30 分钟内有效，仅可使用一次。如不是你本人操作请忽略此邮件。`,
    html: `<div style="${baseStyle}">
      <h2 style="margin-top:0">重置你的密码</h2>
      <p>你好${name ? " " + name : ""}，</p>
      <p>我们收到了来自这个账户的密码重置请求。点击下面的按钮即可设置新密码：</p>
      <p style="margin: 24px 0"><a href="${link}" style="${buttonStyle}">重置密码 →</a></p>
      <p style="color:#71717a;font-size:13px">链接 30 分钟内有效，仅可使用一次。<br/>如果按钮无法点击，请复制下面的链接到浏览器：<br/><code style="word-break:break-all">${link}</code></p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0"/>
      <p style="color:#a1a1aa;font-size:12px">如果不是你本人操作，请忽略这封邮件，账户密码不会被修改。<br/>—— OneClaw</p>
    </div>`,
  };
}

export function emailVerifyEmail(name: string | null, link: string): { subject: string; html: string; text: string } {
  return {
    subject: "OneClaw · 验证你的邮箱",
    text: `欢迎加入 OneClaw${name ? "，" + name : ""}！\n\n请点击链接验证你的邮箱：\n\n${link}\n\n链接 24 小时内有效。`,
    html: `<div style="${baseStyle}">
      <h2 style="margin-top:0">欢迎加入 OneClaw 🎉</h2>
      <p>你好${name ? " " + name : ""}，</p>
      <p>感谢注册 OneClaw。点击下面的按钮验证你的邮箱，即可解锁完整功能：</p>
      <p style="margin: 24px 0"><a href="${link}" style="${buttonStyle}">验证邮箱 →</a></p>
      <p style="color:#71717a;font-size:13px">链接 24 小时内有效。<br/>如果按钮无法点击：<code style="word-break:break-all">${link}</code></p>
    </div>`,
  };
}
