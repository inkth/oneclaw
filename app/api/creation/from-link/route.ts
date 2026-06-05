import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { parseProductLink } from "@/lib/agents/link-parser";

export const maxDuration = 30;

const schema = z.object({
  url: z.string().url("请填一个合法的商品链接"),
});

/**
 * 贴链接 → 识别商品。无需 workspace，游客也能用（识别是吸引上手的关键一步）。
 * 解析只读外部公开页面、不落库，所以不绑定账号；登录与否仅影响限流额度。
 * 真正花钱的「生成视频」仍需登录（见 videos/create）。
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    // 限流：登录用户按 user 宽松；游客按 IP 收紧，防止匿名刷接口烧 LLM
    const rl = userId
      ? await rateLimit({ key: `from-link:u:${userId}`, limit: 30, windowMs: 60 * 60_000 })
      : await rateLimit({ key: `from-link:ip:${getClientIp(req)}`, limit: 8, windowMs: 60 * 60_000 });
    if (!rl.success) {
      return fail(
        userId ? `太频繁，请 ${rl.retryAfter}s 后再试` : `试用识别次数已用完，请 ${rl.retryAfter}s 后再试或登录解锁更多`,
        429,
      );
    }

    const { url } = schema.parse(await req.json());
    const result = await parseProductLink(url);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
