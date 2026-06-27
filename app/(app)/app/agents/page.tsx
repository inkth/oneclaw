import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "../workbench";
import { type StreamTask } from "../task-stream";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesSquare } from "lucide-react";

export const metadata = { title: "全部对话 · 发现猫" };

export default async function AgentsPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  let tasks: StreamTask[] = [];
  if (ws) {
    const res = await apiServer<{ tasks: StreamTask[] }>(
      `/workspaces/${ws.id}/agent-tasks`,
    ).catch(() => ({ tasks: [] as StreamTask[] }));
    tasks = res.tasks ?? [];
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-brand-500" />
            全部对话
          </span>
        }
        description="选品分析 / 做视频 / Listing / 投放复盘——你和 AI 的所有对话都在这里。"
      />
      <Workbench
        workspaceId={ws?.id ?? ""}
        isGuest={!ws}
        initialTasks={tasks}
      />
    </div>
  );
}
