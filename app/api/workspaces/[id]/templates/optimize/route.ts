import { NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { assertCanDispatchTask } from "@/lib/quota";
import { runTemplateOptimizer } from "@/lib/agents/template-optimizer";

export const maxDuration = 60;

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const rl = await rateLimit({
      key: `template-optimize:${id}`,
      limit: 20,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("分析过于频繁，1 小时内最多 20 次", 429);

    const quotaCheck = await assertCanDispatchTask(id);
    if (!quotaCheck.ok) {
      return fail(quotaCheck.reason, 402, { quota: quotaCheck.quota });
    }

    const task = await prisma.agentTask.create({
      data: {
        workspaceId: id,
        agent: "ANALYST",
        input: "模板优化分析（基于历史使用 + 视频成绩）",
        status: "QUEUED",
        metadata: { source: "template-optimizer" },
      },
    });

    after(async () => {
      try {
        await prisma.agentTask.update({
          where: { id: task.id },
          data: { status: "RUNNING", startedAt: new Date() },
        });
        const result = await runTemplateOptimizer(id);
        await prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: "DONE",
            output: result.output,
            metadata: result.metadata,
            model: result.usage.model,
            tokensIn: result.usage.tokensIn,
            tokensOut: result.usage.tokensOut,
            costCents: result.usage.costCents,
            finishedAt: new Date(),
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: "FAILED",
            errorMessage: msg,
            output: `❌ 分析失败：${msg}`,
            finishedAt: new Date(),
          },
        });
      }
    });

    return ok({ task }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}
