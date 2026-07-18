"use client";

import { useState } from "react";
import { Users, UserPlus, Ban, Wallet, Coins, TrendingUp, Film, Image as ImageIcon, ClipboardList, ShieldCheck, RefreshCw } from "lucide-react";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { apiBrowser } from "@/lib/api-browser";
import { fmtYuan, type Dashboard } from "./admin-shared";

export function DashboardTab({ initial }: { initial: Dashboard }) {
  const [d, setD] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await apiBrowser<{ dashboard: Dashboard }>("/admin/dashboard");
      setD(r.dashboard);
    } catch {
      /* 忽略 */
    } finally {
      setRefreshing(false);
    }
  }

  const totalWs = d.workspaceCount || 1;
  const pct = (n: number) => Math.round((n / totalWs) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--dk-content-primary)]">平台总览</h2>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-[var(--dk-stroke-border)] px-3 py-1.5 text-xs text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)] disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> 刷新
        </button>
      </div>

      {/* 用户 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Users} label="用户总数" value={d.userCount} />
        <Stat icon={UserPlus} label="今日新增" value={d.newUsersToday} hint={`近 7 日 +${d.newUsers7d}`} />
        <Stat icon={Ban} label="已封禁" value={d.bannedUserCount} />
        <Stat icon={ShieldCheck} label="代理商" value={d.agencyCount} />
      </div>

      {/* 收入 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Coins} label="累计收入" value={fmtYuan(d.revenueTotalCents)} size="lg" />
        <Stat icon={TrendingUp} label="本月收入" value={fmtYuan(d.revenueMonthCents)} size="lg" />
        <Stat icon={Wallet} label="待审提现" value={d.pendingWithdrawals} />
        <Stat icon={ClipboardList} label="待核销账单" value={d.pendingOverflowBills} />
      </div>

      {/* 订阅分布 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--dk-content-primary)]">订阅分布</div>
          <div className="text-xs text-[var(--dk-content-tertiary)]">{d.workspaceCount} 个工作台 · {d.paidOrderCount} 笔已付款订单</div>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--dk-surface-2)]">
          <div className="bg-emerald-500" style={{ width: `${pct(d.planDist.team)}%` }} />
          <div className="bg-brand-500" style={{ width: `${pct(d.planDist.pro)}%` }} />
          <div className="bg-[var(--dk-stroke-border)]" style={{ width: `${pct(d.planDist.free)}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <LegendDot className="bg-emerald-500" label="旗舰版" value={d.planDist.team} />
          <LegendDot className="bg-brand-500" label="专业版" value={d.planDist.pro} />
          <LegendDot className="bg-[var(--dk-stroke-border)]" label="免费版" value={d.planDist.free} />
        </div>
      </Card>

      {/* 用量 */}
      <div className="grid grid-cols-3 gap-4">
        <Stat icon={Film} label="累计出片" value={d.videoUsage} />
        <Stat icon={ImageIcon} label="累计出图" value={d.imageUsage} />
        <Stat icon={ClipboardList} label="Agent 任务" value={d.agentTaskUsage} />
      </div>
    </div>
  );
}

function LegendDot({ className, label, value }: { className: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--dk-content-secondary)]">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label} <span className="nums font-medium text-[var(--dk-content-primary)]">{value}</span>
    </span>
  );
}
