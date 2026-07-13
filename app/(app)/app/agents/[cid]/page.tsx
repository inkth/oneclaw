import { redirect } from "next/navigation";
import { getMe, apiServer, ApiError } from "@/lib/api-client";
import { Workbench } from "../../workbench";
import { type StreamTask } from "../../task-stream";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesSquare } from "lucide-react";

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
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-brand-500" />
            对话
          </span>
        }
        description="这段对话会保留你的指令、Agent 进度和产出结果，方便随时回来继续。"
      />
      <Workbench
        workspaceId={ws.id}
        conversationId={cid}
        initialTasks={tasks}
      />
    </div>
  );
}
