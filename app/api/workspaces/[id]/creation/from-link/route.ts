import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { parseProductLink } from "@/lib/agents/link-parser";

export const maxDuration = 30;

const schema = z.object({
  url: z.string().url("请填一个合法的商品链接"),
});

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const rl = await rateLimit({
      key: `from-link:${id}`,
      limit: 20,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail(`太频繁，请 ${rl.retryAfter}s 后再试`, 429);

    const { url } = schema.parse(await req.json());

    const result = await parseProductLink(url);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
