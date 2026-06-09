import { getMe } from "@/lib/api-client";
import { AgentComposer } from "../agent-composer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Bot } from "lucide-react";

export const metadata = { title: "Agent · OneClaw" };

export default async function AgentsPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bot className="h-5 w-5 text-brand-500" />
            AI Agent
          </span>
        }
        description="派发市场分析师 / 创意总监 / 品牌运营官,异步执行后到对应模块查看结果。"
      />
      <AgentComposer workspaceId={ws?.id ?? ""} isGuest={!ws} />
    </div>
  );
}
