import Link from "next/link";
import { getMe, apiServer } from "@/lib/api-client";
import { TrendingUp, Video, Bot, ArrowRight } from "lucide-react";
import { OnboardingCard } from "@/components/OnboardingCard";
import { Stat } from "@/components/ui/Stat";
import { Badge } from "@/components/ui/Badge";
import { AGENT_IDENTITY, TASK_STATUS_TONE, TASK_STATUS_LABEL, type AgentKey } from "@/lib/ui/tokens";
import { AgentComposer } from "./agent-composer";

export const metadata = { title: "工作台 · OneClaw" };

type AgentTask = {
  id: string;
  agent: string;
  status: string;
  input: string;
  createdAt: string;
};

export default async function DashboardPage() {
  // 游客可浏览;无工作台时各项为空。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;

  let productCount = 0;
  let videoCount = 0;
  let tasks: AgentTask[] = [];
  if (workspace) {
    const [prod, vids, ts] = await Promise.all([
      apiServer<{ products: unknown[] }>(`/workspaces/${workspace.id}/products`).catch(() => ({ products: [] })),
      apiServer<{ videos: unknown[] }>(`/workspaces/${workspace.id}/videos`).catch(() => ({ videos: [] })),
      apiServer<{ tasks: AgentTask[] }>(`/workspaces/${workspace.id}/agent-tasks`).catch(() => ({ tasks: [] })),
    ]);
    productCount = prod.products?.length ?? 0;
    videoCount = vids.videos?.length ?? 0;
    tasks = ts.tasks ?? [];
  }

  const taskCount = tasks.length;
  const recentTasks = tasks.slice(0, 5);
  const isFresh = productCount === 0 && videoCount === 0 && taskCount === 0;
  const greeting =
    user?.name || user?.phone?.slice(-4) || user?.email?.split("@")[0] || "访客";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-title text-zinc-900">你好，{greeting}</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {!workspace
            ? "这是 OneClaw 概览。给下面的 Agent 派个活,或登录后拥有自己的工作台。"
            : isFresh
              ? `欢迎来到 ${workspace.name} —— 给 Agent 派个活,跑通你的第一条出海链路吧。`
              : `这是 ${workspace.name} 的今日概览。给 Agent 派个活就从下面开始。`}
        </p>
      </div>

      {/* 核心:给三位 Agent 派活的聊天框 */}
      <AgentComposer workspaceId={workspace?.id ?? ""} isGuest={!workspace} />

      {workspace && isFresh && <OnboardingCard workspaceId={workspace.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={TrendingUp} label="选品库存" value={productCount} href="/app/assets/products" size="lg" />
        <Stat icon={Video} label="已生成视频" value={videoCount} href="/app/videos" size="lg" />
        <Stat icon={Bot} label="Agent 任务" value={taskCount} href="/app/agents" size="lg" />
      </div>

      <section className="rounded-xl border border-zinc-200/80 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">最近 Agent 任务</h2>
          <Link
            href="/app/agents"
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            全部 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentTasks.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            还没有任务。在上面的聊天框给 Agent 派个活试试。
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recentTasks.map((t) => {
              const agent = AGENT_IDENTITY[t.agent as AgentKey];
              return (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                  {agent && (
                    <Badge tone={agent.tone} outline={false}>
                      {agent.label}
                    </Badge>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-zinc-800">{t.input}</div>
                    <div className="mt-0.5 text-2xs text-zinc-400">
                      {new Date(t.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <Badge tone={TASK_STATUS_TONE[t.status] ?? "neutral"}>
                    {TASK_STATUS_LABEL[t.status] ?? t.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
