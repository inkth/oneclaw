import { redirect } from "next/navigation";
import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "../workbench";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesSquare } from "lucide-react";
import { type Conversation } from "../conversation-rail";

export const metadata = { title: "会话 · 发现猫" };

// 会话板块落地:有历史会话则进最近一条;无则落到新对话(游客直接渲染新对话页)。
export default async function AgentsPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  if (!ws) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-brand-500" />
              会话
            </span>
          }
          description="选个 Agent，写一句指令试试。登录后对话会按会话存进左侧列表。"
        />
        <Workbench workspaceId="" isGuest conversationId="" />
      </div>
    );
  }

  const res = await apiServer<{ conversations: Conversation[] }>(
    `/workspaces/${ws.id}/conversations`,
  ).catch(() => ({ conversations: [] as Conversation[] }));
  const latest = res.conversations?.[0];
  redirect(latest ? `/app/agents/${latest.id}` : "/app/agents/new");
}
