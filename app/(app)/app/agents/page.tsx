import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { AgentRunner } from "./agent-runner";

export const metadata = { title: "Agent 工作流 · OneClaw" };

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  const tasks = await prisma.agentTask.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent 工作流</h1>
        <p className="mt-1 text-sm text-zinc-500">
          向 OneClaw 的三位 Agent 派发任务，输出会同步落到工作台。
        </p>
      </div>

      <AgentRunner
        workspaceId={workspace.id}
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
