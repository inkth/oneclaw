import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { issueCode } from "@/lib/phoneverify";

const schema = z.object({
  phone: z.string().min(11).max(20),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone } = schema.parse(body);

    const ip = getClientIp(req);

    // 双重 rate limit：同 IP 一小时 20 次 + 同手机号一小时 5 次
    const ipRL = await rateLimit({
      key: `send-code:ip:${ip}`,
      limit: 20,
      windowMs: 60 * 60_000,
    });
    if (!ipRL.success) {
      return fail(`太频繁了，请 ${ipRL.retryAfter}s 后再试`, 429);
    }
    const phoneRL = await rateLimit({
      key: `send-code:phone:${phone}`,
      limit: 5,
      windowMs: 60 * 60_000,
    });
    if (!phoneRL.success) {
      return fail(`该号码请求过多，请 ${phoneRL.retryAfter}s 后再试`, 429);
    }

    const result = await issueCode(phone);
    if (!result.ok) {
      return fail(result.reason, 400);
    }

    return ok({
      sent: true,
      expiresInSec: result.expiresInSec,
      // 仅 dev console fallback 时返回，方便前端提示"已打印到 dev terminal"
      devCode: result.codeForDev,
    });
  } catch (err) {
    return handleError(err);
  }
}
