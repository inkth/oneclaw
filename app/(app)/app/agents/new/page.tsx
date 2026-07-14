import { getMe } from "@/lib/api-client";
import { Workbench } from "../../workbench";
import type { ComposerKind } from "../../agent-composer";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesSquare } from "lucide-react";

export const metadata = { title: "新对话 · 发现猫" };

// 新对话：空会话页，首次派活后端自动建会话并路由到 /app/agents/[cid]。
const AGENT_KINDS = new Set<ComposerKind>(["ADVISOR", "ANALYST", "DIRECTOR", "LISTING", "REVIEW"]);

export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const me = await getMe();
  const ws = me?.workspace ?? null;
  const initialAgent = AGENT_KINDS.has(sp.agent as ComposerKind)
    ? (sp.agent as ComposerKind)
    : undefined;
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-brand-500" />
            新对话
          </span>
        }
        description="选一个 Agent，说清目标。发送后会自动创建并保存这段对话。"
      />
      <Workbench
        workspaceId={ws?.id ?? ""}
        isGuest={!ws}
        conversationId=""
        initialAgent={initialAgent}
        initialInput={sp.prompt}
      />
    </div>
  );
}
