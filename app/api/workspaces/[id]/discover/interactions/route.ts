import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";

const upsertSchema = z.object({
  externalId: z.string().min(1),
  region: z.enum(["US", "GB", "ID", "TH", "VN", "MY"]),
  isStarred: z.boolean().optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
  note: z.string().max(2000).optional(),
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
      key: `discover-interaction:${id}`,
      limit: 200,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("操作过于频繁", 429);

    const body = await req.json();
    const data = upsertSchema.parse(body);

    const dp = await prisma.discoverProduct.findUnique({
      where: {
        provider_externalId_region: {
          provider: "echotik",
          externalId: data.externalId,
          region: data.region,
        },
      },
    });
    if (!dp) return fail("商品未在 Discover 库中，刷新页面或先查看一次榜单", 404);

    const interaction = await prisma.workspaceDiscoverInteraction.upsert({
      where: {
        workspaceId_discoverProductId: {
          workspaceId: id,
          discoverProductId: dp.id,
        },
      },
      create: {
        workspaceId: id,
        discoverProductId: dp.id,
        isStarred: data.isStarred ?? false,
        tags: data.tags ?? [],
        note: data.note,
      },
      update: {
        ...(data.isStarred !== undefined && { isStarred: data.isStarred }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.note !== undefined && { note: data.note }),
      },
    });

    return ok({ interaction });
  } catch (err) {
    return handleError(err);
  }
}
