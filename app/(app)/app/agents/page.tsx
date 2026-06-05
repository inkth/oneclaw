import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { AgentRunner } from "./agent-runner";

export const metadata = { title: "Agent 工作流 · OneClaw" };

export default async function AgentsPage() {
  // 游客也能看（空态）；动手的动作再提示登录
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  const tasks = workspace
    ? await prisma.agentTask.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent 工作流</h1>
        <p className="mt-1 text-sm text-zinc-500">
          向 OneClaw 的三位 Agent 派发任务，输出会同步落到工作台。
        </p>
      </div>

      <AgentRunner
        isGuest={!workspace}
      workspaceId={workspace?.id ?? ""}
        initialTasks={tasks.map((t) => ({
          id: t.id,
          agent: t.agent,
          input: t.input,
          output: t.output,
          status: t.status,
          createdAt: t.createdAt.toISOString(),
          costCents: t.costCents,
          model: t.model,
        }))}
      />
    </div>
  );
}
