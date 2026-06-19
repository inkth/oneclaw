"use client";

import { Clapperboard, Coins, Image as ImageIcon, LockKeyhole, Wallet } from "lucide-react";
import { Stat } from "@/components/ui/Stat";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import type { Usage } from "./settings/settings-client";

/**
 * 驾驶舱顶部的经营概况:本周期派活 / 成片 / 出图 / 成本 四张 Stat 卡。
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
            desc: "本周期派活、成片、出图与成本,登录后一眼看清自己的生意。",
          })
        }
        className="dk-card lift flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-ink">登录查看经营概况</div>
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

  const { used, limit } = usage.credits;
  const unlimited = limit < 0;
  const remaining = unlimited ? "∞" : Math.max(0, limit - used);
  const pct = unlimited ? 0 : Math.round((used / Math.max(1, limit)) * 100);
  const creditHint = unlimited
    ? "团队版不限积分"
    : pct >= 90
      ? "积分告急,去设置升级"
      : `本周期已用 ${used} 积分`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={Coins}
        label="本周期积分余额"
        value={`${remaining}${unlimited ? "" : `/${limit}`}`}
        hint={creditHint}
        href="/app/settings"
      />
      <Stat
        icon={Clapperboard}
        label="本周期成片"
        value={`${usage.breakdown.videos}`}
        hint="本周期出片条数"
        href="/app/videos"
      />
      <Stat
        icon={ImageIcon}
        label="本周期出图"
        value={`${usage.breakdown.images}`}
        hint="Listing 主图等出图张数"
        href="/app/settings"
      />
      <Stat
        icon={Wallet}
        label="本周期生成成本"
        value={`¥${(usage.costCents / 100).toFixed(2)}`}
        hint="LLM + 视频/出图服务累计"
        href="/app/settings"
      />
    </div>
  );
}
