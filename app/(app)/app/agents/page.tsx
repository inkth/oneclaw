import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "../workbench";
import { type StreamTask } from "../task-stream";
import { PageHeader } from "@/components/ui/PageHeader";
import { Bot } from "lucide-react";

export const metadata = { title: "Agent · OneClaw" };

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
            <Bot className="h-5 w-5 text-brand-500" />
            AI Agent
          </span>
        }
        description="选品分析 / 短视频创作 / Listing 内容 / 运营排期,或交给全链路小队串行交付。全部任务历史都在这里。"
      />
      <Workbench workspaceId={ws?.id ?? ""} isGuest={!ws} initialTasks={tasks} />
    </div>
  );
}
