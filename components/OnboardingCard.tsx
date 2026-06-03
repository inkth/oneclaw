"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  Video,
  Globe,
  Loader2,
} from "lucide-react";

const industryPresets = [
  { label: "3C 数码", prompt: "找一些适合 TikTok 的 3C 数码新爆品，毛利 45%+，售价 $15-50" },
  { label: "厨房小电", prompt: "找便携、颜值高、单价 $20-60 的厨房小家电，覆盖欧美和东南亚" },
  { label: "宠物用品", prompt: "找复购率高的宠物用品，毛利 50%+，月销 3K+，避开重资产品类" },
  { label: "母婴用品", prompt: "找东南亚母婴本周新爆品，安全材质、毛利 40%+，月销 2K+" },
  { label: "户外露营", prompt: "找轻量、便携、季节性强的户外露营装备，毛利 45%+" },
  { label: "美妆护肤", prompt: "找适合短视频展示的小众美妆护肤，前后对比效果明显，毛利 55%+" },
];

export function OnboardingCard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function quickStart(prompt: string, label: string) {
    if (dispatching) return;
    setDispatching(label);
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/agent-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "ANALYST", input: prompt }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setDispatching(null);
      setError(json?.error?.message || "派发失败");
      return;
    }
    router.push("/app/agents");
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/40 p-6 sm:p-10">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 90% 10%, rgba(139,92,246,0.18), transparent 50%), radial-gradient(circle at 10% 90%, rgba(99,102,241,0.18), transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 shadow-sm">
            <Sparkles className="h-3 w-3" />
            欢迎来到 OneClaw
          </div>
          <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight">
            选一个品类，30 秒跑通你的第一条出海链路
          </h2>
          <p className="mt-2 text-sm text-zinc-600 max-w-2xl">
            点下面任一品类，分析师 Agent 会立刻为你扫描这个赛道的高潜爆品，自动写入选品库。
            之后你可以再让创意总监给爆品出短视频，让运营官安排发布日程。
          </p>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {industryPresets.map((p) => (
              <button
                key={p.label}
                onClick={() => quickStart(p.prompt, p.label)}
                disabled={!!dispatching}
                className="group inline-flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-medium text-zinc-800 hover:border-indigo-300 hover:bg-indigo-50/50 disabled:opacity-50 transition-all text-left"
              >
                <span>{p.label}</span>
                {dispatching === p.label ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
              {error}
            </div>
          )}

          <div className="mt-5 text-xs text-zinc-500">
            或者，
            <Link href="/app/agents" className="ml-1 text-indigo-600 hover:text-indigo-700 font-medium">
              手写一个 Agent 派发指令 →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Step
          n={1}
          icon={TrendingUp}
          tone="indigo"
          title="市场分析师"
          desc="给它一句话需求，它会扫数据 → 排 ROI → 写入选品库。"
        />
        <Step
          n={2}
          icon={Video}
          tone="violet"
          title="创意总监"
          desc="给它一个推荐选品，它会写 4 套脚本 + 出 4 张封面 + 跑 4 条短视频。"
        />
        <Step
          n={3}
          icon={Globe}
          tone="fuchsia"
          title="品牌运营官"
          desc="给它你已有的视频清单，它会排好 TikTok / IG / YouTube 三平台周日历。"
        />
      </div>
    </div>
  );
}

const toneMap = {
  indigo: "from-indigo-500 to-indigo-600",
  violet: "from-violet-500 to-violet-600",
  fuchsia: "from-fuchsia-500 to-fuchsia-600",
} as const;

function Step({
  n,
  icon: Icon,
  tone,
  title,
  desc,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof toneMap;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${toneMap[tone]} text-white`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
          STEP {n}
        </div>
      </div>
      <div className="mt-4 text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  );
}
