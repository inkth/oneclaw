import { NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { agentTaskSchema } from "@/lib/validations";
import { ok, fail, handleError } from "@/lib/api";
import { executeAgentTask } from "@/lib/agents";
import { assertCanDispatchTask, assertCanGenerateVideo } from "@/lib/quota";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const tasks = await prisma.agentTask.findMany({
      where: { workspaceId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ tasks });
  } catch (err) {
    return handleError(err);
  }
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
      key: `agent-task:${id}`,
      limit: 30,
      windowMs: 60 * 60_000, // 30 任务 / 小时 / 工作台（除了月度配额额外的短期防刷）
    });
    if (!rl.success) {
      return fail(`发送过于频繁，请 ${rl.retryAfter}s 后再试`, 429);
    }

    const body = await req.json();
    const data = agentTaskSchema.parse(body);

    const quotaCheck = await assertCanDispatchTask(id);
    if (!quotaCheck.ok) {
      return fail(quotaCheck.reason, 402, { quota: quotaCheck.quota });
    }
    if (data.agent === "DIRECTOR") {
      const videoCheck = await assertCanGenerateVideo(id);
      if (!videoCheck.ok) {
        return fail(videoCheck.reason, 402, { quota: videoCheck.quota });
      }
    }

    const task = await prisma.agentTask.create({
      data: {
        workspaceId: id,
        agent: data.agent,
        input: data.input,
        status: "QUEUED",
      },
    });

    // 响应已发出后再跑 Agent，避免阻塞前端
    after(async () => {
      await executeAgentTask(task.id);
    });

    return ok({ task }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}
