import { redirect } from "next/navigation";
import { getMe, apiServer, ApiError } from "@/lib/api-client";
import { Workbench } from "../../workbench";
import { type StreamTask } from "../../task-stream";

export const metadata = { title: "对话 · 发现猫" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { cid } = await params;
  const me = await getMe();
  const ws = me?.workspace ?? null;
  if (!ws) redirect("/app/agents");

  // 取该会话的任务流；仅当会话不存在/已删除（404）才退回落地，避免与 /app/agents 的
  // 「转最近一条」在后端瞬时 5xx 时来回跳。其它错误降级为空流，页面仍可用。
  let tasks: StreamTask[] = [];
  try {
    const res = await apiServer<{ tasks: StreamTask[] }>(
      `/workspaces/${ws.id}/conversations/${cid}/tasks`,
    );
    tasks = res.tasks ?? [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) redirect("/app/agents");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Workbench
        workspaceId={ws.id}
        conversationId={cid}
        initialTasks={tasks}
      />
    </div>
  );
}
