import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { TrendingUp, Video, Bot, ArrowRight } from "lucide-react";
import { OnboardingCard } from "@/components/OnboardingCard";

export const metadata = { title: "工作台 · OneClaw" };

export default async function DashboardPage() {
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  const [productCount, videoCount, taskCount, recentTasks] = workspace
    ? await Promise.all([
        prisma.product.count({ where: { workspaceId: workspace.id } }),
        prisma.video.count({ where: { workspaceId: workspace.id } }),
        prisma.agentTask.count({ where: { workspaceId: workspace.id } }),
        prisma.agentTask.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ])
    : [0, 0, 0, [] as Awaited<ReturnType<typeof prisma.agentTask.findMany>>];

  const isFresh = productCount === 0 && videoCount === 0 && taskCount === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          你好，{session?.user?.name || session?.user?.phone?.slice(-4) || session?.user?.email?.split("@")[0] || "访客"} 👋
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {!workspace
            ? "这是 OneClaw 概览。登录后即可拥有自己的工作台、选品库与数据。"
            : isFresh
              ? `欢迎来到 ${workspace.name} —— 先跑通你的第一条出海链路吧。`
              : `这是 ${workspace.name} 的今日概览。`}
        </p>
      </div>

      {!workspace && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-indigo-900">
            <span className="font-semibold">试用模式</span>
            ：可逛全部页面与 TikTok 爆品。登录后解锁选品库、生成视频与数据看板。
          </div>
          <Link
            href="/login?callbackUrl=/app"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 whitespace-nowrap"
          >
            登录 / 注册
          </Link>
        </div>
      )}

      {workspace && isFresh && <OnboardingCard workspaceId={workspace.id} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={TrendingUp}
          tone="indigo"
          label="选品库存"
          value={productCount}
          href="/app/products"
        />
        <StatCard
          icon={Video}
          tone="violet"
          label="已生成视频"
          value={videoCount}
          href="/app/videos"
        />
        <StatCard
          icon={Bot}
          tone="fuchsia"
          label="Agent 任务"
          value={taskCount}
          href="/app/agents"
        />
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold">最近 Agent 任务</h2>
          <Link
            href="/app/agents"
            className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
          >
            全部 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentTasks.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">
            还没有任务。前往{" "}
            <Link href="/app/agents" className="text-indigo-600">
              Agent 工作流
            </Link>{" "}
            提交一个吧。
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recentTasks.map((t) => (
              <li key={t.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                <AgentChip agent={t.agent} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{t.input}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {new Date(t.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <StatusChip status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const toneMap = {
  indigo: "from-indigo-500 to-indigo-600",
  violet: "from-violet-500 to-violet-600",
  fuchsia: "from-fuchsia-500 to-fuchsia-600",
} as const;

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof toneMap;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-5 hover:border-indigo-200 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${toneMap[tone]} text-white`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-indigo-500 transition-colors" />
      </div>
      <div className="mt-5 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
    </Link>
  );
}

function AgentChip({ agent }: { agent: "ANALYST" | "DIRECTOR" | "OPERATOR" }) {
  const map = {
    ANALYST: { label: "分析师", cls: "bg-indigo-50 text-indigo-700" },
    DIRECTOR: { label: "创意总监", cls: "bg-violet-50 text-violet-700" },
    OPERATOR: { label: "运营官", cls: "bg-fuchsia-50 text-fuchsia-700" },
  };
  const it = map[agent];
  return (
    <span className={`inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${it.cls}`}>
      {it.label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    QUEUED: "bg-zinc-100 text-zinc-600",
    RUNNING: "bg-amber-50 text-amber-700",
    DONE: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        map[status] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {status}
    </span>
  );
}
