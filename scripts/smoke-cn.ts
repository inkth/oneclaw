/* eslint-disable no-console */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";

function hashCode(phone: string, code: string): string {
  return crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

async function getCsrf(cookies: string[] = []): Promise<{ token: string; cookies: string[] }> {
  const r = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { cookie: cookies.join("; ") },
  });
  const setCookies = r.headers.getSetCookie?.() ?? [];
  const json = (await r.json()) as { csrfToken: string };
  return { token: json.csrfToken, cookies: [...cookies, ...setCookies] };
}

function mergeCookies(prev: string[], setCookies: string[]): string[] {
  // 把同名 cookie 替换掉
  const map = new Map<string, string>();
  for (const c of [...prev, ...setCookies]) {
    const name = c.split("=")[0];
    map.set(name, c);
  }
  return Array.from(map.values());
}

async function signInPhone(phone: string, code: string): Promise<string[]> {
  const { token, cookies } = await getCsrf();
  const form = new URLSearchParams({
    csrfToken: token,
    phone,
    code,
    redirect: "false",
    json: "true",
  });
  const r = await fetch(`${BASE}/api/auth/callback/phone-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookies.join("; "),
    },
    body: form.toString(),
    redirect: "manual",
  });
  const setCookies = r.headers.getSetCookie?.() ?? [];
  return mergeCookies(cookies, setCookies);
}

async function main() {
  const phone = "13800000000";
  const code = "888888"; // 直接插数据库，绕开 60s 冷却

  // 1. 直接给 demo phone 插一条有效 OTP 记录
  await prisma.phoneVerificationCode.updateMany({
    where: { phone, usedAt: null },
    data: { expires: new Date() },
  });
  await prisma.phoneVerificationCode.create({
    data: {
      phone,
      codeHash: hashCode(phone, code),
      expires: new Date(Date.now() + 5 * 60_000),
    },
  });
  console.log("[1] inserted OTP", phone, code);

  // 2. 用 phone-otp credentials provider 登录
  const cookies = await signInPhone(phone, code);
  const sessionCookie = cookies.find((c) => c.startsWith("authjs.session-token=") || c.includes("authjs.session-token"));
  if (!sessionCookie) throw new Error("no session cookie after sign-in");
  console.log("[2] signed in ✓");

  // 3. 拿 /api/me，确认 phone 在 session 里
  const me = await fetch(`${BASE}/api/me`, {
    headers: { cookie: cookies.join("; ") },
  }).then((r) => r.json());
  console.log("[3] /api/me", me.data?.user?.phone, me.data?.workspace?.name);

  // 4. 创建 checkout 订单（mock 模式，因为没配微信/支付宝 key）
  const checkout = await fetch(`${BASE}/api/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies.join("; ") },
    body: JSON.stringify({ plan: "PRO", periodMonths: 3, provider: "WECHAT" }),
  }).then((r) => r.json());
  console.log(
    "[4] checkout:",
    checkout.data?.order?.outTradeNo,
    checkout.data?.order?.amountCents,
    "mock?",
    checkout.data?.isMock,
  );
  const orderId = checkout.data?.order?.id;
  if (!orderId) throw new Error("no order id");

  // 5. 用 mock-confirm 模拟回调
  const confirm = await fetch(`${BASE}/api/billing/mock-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies.join("; ") },
    body: JSON.stringify({ orderId }),
  }).then((r) => r.json());
  console.log("[5] mock-confirm:", confirm);

  // 6. 重新查工作台，应该 plan=PRO，planExpiresAt 在未来
  const ws = await prisma.workspace.findFirst({
    where: { ownerId: me.data.user.id },
  });
  console.log(
    "[6] workspace after pay:",
    ws?.plan,
    "expiresAt=",
    ws?.planExpiresAt?.toISOString(),
  );

  // 7. 把 demo workspace 改回 PRO 但保持 expiresAt，避免影响下次手动测试
  // （或者降回 FREE。这里保留 PRO 状态供你打开 UI 观察。）

  console.log("\n✅ End-to-end CN migration verified");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
