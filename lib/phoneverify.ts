import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { sendVerificationCode } from "@/lib/sms";

const CN_PHONE = /^1[3-9]\d{9}$/;
const CODE_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_ACTIVE_PER_PHONE = 1;

export function normalizePhone(input: string): string | null {
  const s = input.replace(/\s|-/g, "").replace(/^\+86/, "");
  if (!CN_PHONE.test(s)) return null;
  return s;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

function randomCode6(): string {
  // 不要让首位为 0（也避免 leading-zero 被 UI 误处理）
  const n = crypto.randomInt(100_000, 1_000_000);
  return n.toString();
}

function hashCode(phone: string, code: string): string {
  return crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export type IssueResult =
  | { ok: true; expiresInSec: number; codeForDev?: string }
  | { ok: false; reason: string };

export async function issueCode(rawPhone: string): Promise<IssueResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, reason: "手机号格式不正确" };

  // 60s 内只能有一条未失效 code（防短信轰炸）
  const recent = await prisma.phoneVerificationCode.findFirst({
    where: {
      phone,
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
  });
  if (recent) {
    return { ok: false, reason: "请求过于频繁，请稍后再试" };
  }

  // 把之前还没用过的 code 全部置为过期（避免一个手机号上有多条活跃）
  if (MAX_ACTIVE_PER_PHONE === 1) {
    await prisma.phoneVerificationCode.updateMany({
      where: { phone, usedAt: null, expires: { gt: new Date() } },
      data: { expires: new Date() },
    });
  }

  const code = randomCode6();
  const codeHash = hashCode(phone, code);
  await prisma.phoneVerificationCode.create({
    data: {
      phone,
      codeHash,
      expires: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  const send = await sendVerificationCode(phone, code);
  if (!send.ok) {
    // 短信发送失败：标记本条立刻过期，让用户重发
    await prisma.phoneVerificationCode.updateMany({
      where: { phone, codeHash, usedAt: null },
      data: { expires: new Date() },
    });
    return { ok: false, reason: `短信发送失败：${send.reason}` };
  }

  return {
    ok: true,
    expiresInSec: Math.floor(CODE_TTL_MS / 1000),
    // 仅当用 console fallback 时把 code 一同返回，方便 dev/测试。生产环境永远不会带这个字段
    codeForDev:
      send.reason === "console-fallback" && process.env.NODE_ENV !== "production"
        ? code
        : undefined,
  };
}

export type VerifyResult =
  | { ok: true; phone: string }
  | { ok: false; reason: string };

export async function verifyCode(rawPhone: string, rawCode: string): Promise<VerifyResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, reason: "手机号格式不正确" };
  if (!/^\d{6}$/.test(rawCode.trim())) {
    return { ok: false, reason: "验证码格式不正确" };
  }

  const code = rawCode.trim();
  const codeHash = hashCode(phone, code);
  const record = await prisma.phoneVerificationCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { ok: false, reason: "验证码不存在或已过期，请重新获取" };

  if (record.expires.getTime() < Date.now()) {
    return { ok: false, reason: "验证码已过期，请重新获取" };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    // 失败次数过多，强制失效
    await prisma.phoneVerificationCode.update({
      where: { id: record.id },
      data: { expires: new Date() },
    });
    return { ok: false, reason: "尝试次数过多，请重新获取验证码" };
  }

  if (record.codeHash !== codeHash) {
    await prisma.phoneVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "验证码不正确" };
  }

  await prisma.phoneVerificationCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return { ok: true, phone };
}
