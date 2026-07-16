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
  // 情境接力（如详情页猫标）可带结构化资产：DIRECTOR/LISTING 派活时注入真实商品/素材
  const initialProductId = sp.productId || undefined;
  const initialMaterialId = sp.materialId || undefined;
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
      {/* key：同路由软导航（换个详情页再点猫标）不重挂载会吞掉新预填，参数进 key 强制重置 */}
      <Workbench
        key={[ws?.id ?? "guest", initialAgent, sp.prompt, initialProductId, initialMaterialId].join("|")}
        workspaceId={ws?.id ?? ""}
        isGuest={!ws}
        conversationId=""
        initialAgent={initialAgent}
        initialInput={sp.prompt}
        initialProductId={initialProductId}
        initialMaterialId={initialMaterialId}
      />
    </div>
  );
}
