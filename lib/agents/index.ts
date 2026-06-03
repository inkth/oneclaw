import { prisma } from "@/lib/db";
import { isOpenRouterConfigured } from "@/lib/openrouter";
import { runAnalyst } from "./analyst";
import { runDirector } from "./director";
import { runOperator } from "./operator";
import type { AgentKind } from "@prisma/client";

/**
 * 后台跑一个 AgentTask：更新状态、调用对应 agent、写回结果。
 * 调用方应该 fire-and-forget（用 next/server 的 after()）。
 */
export async function executeAgentTask(taskId: string) {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task) {
    console.warn("[agents] task not found", taskId);
    return;
  }

  await prisma.agentTask.update({
    where: { id: taskId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  if (!isOpenRouterConfigured()) {
    await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status: "FAILED",
        errorMessage: "OPENROUTER_API_KEY 未配置",
        finishedAt: new Date(),
      },
    });
    return;
  }

  try {
    const result = await dispatch(task.agent, task.input, task.workspaceId);
    await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status: "DONE",
        output: result.output,
        metadata: result.metadata as object,
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costCents: result.usage.costCents,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    console.error("[agents] task failed", taskId, e);
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status: "FAILED",
        errorMessage: msg,
        output: `❌ 执行失败：${msg}`,
        finishedAt: new Date(),
      },
    });
  }
}

async function dispatch(
  agent: AgentKind,
  input: string,
  workspaceId: string,
) {
  switch (agent) {
    case "ANALYST":
      return runAnalyst(input, workspaceId);
    case "DIRECTOR":
      return runDirector(input, workspaceId);
    case "OPERATOR":
      return runOperator(input, workspaceId);
  }
}
