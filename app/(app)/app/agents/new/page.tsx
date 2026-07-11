import { getMe } from "@/lib/api-client";
import { Workbench } from "../../workbench";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesSquare } from "lucide-react";

export const metadata = { title: "新会话 · 发现猫" };

// 新对话：空会话页，首次派活后端自动建会话并路由到 /app/agents/[cid]。
export default async function NewConversationPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-brand-500" />
            新会话
          </span>
        }
        description="选个 Agent，写一句指令开始。发出后会自动建一条会话，收纳这次往来。"
      />
      <Workbench workspaceId={ws?.id ?? ""} isGuest={!ws} conversationId="" />
    </div>
  );
}
