import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id, taskId } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const task = await prisma.agentTask.findFirst({
      where: { id: taskId, workspaceId: id },
    });
    if (!task) return fail("任务不存在", 404);

    return ok({ task });
  } catch (err) {
    return handleError(err);
  }
}
