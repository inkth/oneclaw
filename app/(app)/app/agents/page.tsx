import { getMe } from "@/lib/api-client";
import { AgentComposer } from "../agent-composer";

export const metadata = { title: "Agent · OneClaw" };

export default async function AgentsPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Agent</h1>
        <p className="mt-1 text-sm text-zinc-500">
          派发市场分析师 / 创意总监 / 品牌运营官,异步执行后到对应模块查看结果。
        </p>
      </div>
      <AgentComposer workspaceId={ws?.id ?? ""} isGuest={!ws} />
    </div>
  );
}
