"use client";

import { Clapperboard, Image as ImageIcon, LockKeyhole, Wallet, Zap } from "lucide-react";
import { Stat } from "@/components/ui/Stat";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import type { Usage } from "./settings/settings-client";

/**
 * 驾驶舱顶部的经营概况:本月派活 / 成片 / 出图 / 成本 四张 Stat 卡。
 * 游客拿不到 usage(需登录),整块降级为登录引导卡。
 */
export function DashboardStats({
  usage,
  isGuest = false,
}: {
  usage: Usage | null;
  isGuest?: boolean;
}) {
  const { open: openAuthModal } = useAuthModal();

  if (isGuest) {
    return (
      <button
        onClick={() =>
          openAuthModal({
            title: "登录查看经营概况",
            desc: "本月派活、成片、出图与成本,登录后一眼看清自己的生意。",
          })
        }
        className="dk-card lift flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-ink">登录查看本月经营概况</div>
          <div className="mt-1 text-xs text-zinc-500">
            派活次数、成片数、出图数与生成成本,都会汇总在这里。
          </div>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
          <LockKeyhole className="h-4 w-4" />
        </span>
      </button>
    );
  }

  if (!usage) {
    return (
      <div className="dk-card p-5 text-sm text-zinc-400">用量数据暂不可用,稍后刷新重试。</div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={Zap}
        label="本月派活"
        value={quota(usage.agentTasks)}
        hint={quotaHint(usage.agentTasks, "Agent 任务额度")}
        href="/app/agents"
      />
      <Stat
        icon={Clapperboard}
        label="本月成片"
        value={quota(usage.videos)}
        hint={quotaHint(usage.videos, "视频生成额度")}
        href="/app/videos"
      />
      <Stat
        icon={ImageIcon}
        label="本月出图"
        value={quota(usage.images)}
        hint={quotaHint(usage.images, "Listing 主图等出图额度")}
        href="/app/settings"
      />
      <Stat
        icon={Wallet}
        label="本月生成成本"
        value={`¥${(usage.costCents / 100).toFixed(2)}`}
        hint="LLM + 视频/出图服务累计"
        href="/app/settings"
      />
    </div>
  );
}

function quota(item: { used: number; limit: number }): string {
  return `${item.used}/${item.limit < 0 ? "∞" : item.limit}`;
}

function quotaHint(item: { used: number; limit: number }, label: string): string {
  if (item.limit < 0) return label;
  const pct = Math.round((item.used / Math.max(1, item.limit)) * 100);
  return pct >= 90 ? "额度告急,去设置页升级方案" : label;
}
