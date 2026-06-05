import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { parseReport } from "@/lib/review/parse";
import { analyzeReview } from "@/lib/review/analyze";

export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

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
      key: `review-analyze:${id}`,
      limit: 60,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("分析过于频繁，请稍后再试", 429);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("缺少报表文件", 400);
    if (file.size > MAX_BYTES) return fail(`文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`, 400);

    const targetRoiRaw = Number(form.get("targetRoi"));
    const targetRoi = isFinite(targetRoiRaw) && targetRoiRaw > 0 ? targetRoiRaw : undefined;

    const buf = Buffer.from(await file.arrayBuffer());
    const { rows, warnings } = await parseReport(buf, file.name);
    if (!rows.length) {
      return fail(warnings[0] || "未解析到有效数据，请检查报表格式", 422, { warnings });
    }

    const result = analyzeReview(rows, { targetRoi, warnings });
    return ok({ result });
  } catch (err) {
    return handleError(err);
  }
}
