"use client";

import { useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  Clapperboard,
  Coins,
  CreditCard,
  Image as ImageIcon,
  Phone,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { CheckoutModal } from "@/components/CheckoutModal";
import { LogoutButton } from "@/components/LogoutButton";
import type { Me } from "@/lib/api-client";

export type Usage = {
  plan: string;
  planExpiresAt?: string | null;
  periodStart: string;
  credits: { used: number; limit: number };
  breakdown: { agentTasks: number; videos: number; images: number };
  creditCosts: { agentTask: number; video: number; image: number };
  costCents: number;
};

const PLAN_META: Record<string, { label: string; tone: "neutral" | "brand" | "success" }> = {
  FREE: { label: "免费版", tone: "neutral" },
  PRO: { label: "专业版", tone: "brand" },
  TEAM: { label: "团队版", tone: "success" },
};

export function SettingsClient({
  user,
  workspace,
  usage,
  initialUpgrade,
}: {
  user: Me["user"];
  workspace: Me["workspace"];
  usage: Usage | null;
  initialUpgrade: "PRO" | "TEAM" | null;
}) {
  const [checkout, setCheckout] = useState<"PRO" | "TEAM" | null>(initialUpgrade);
  const plan = usage?.plan ?? workspace.plan ?? "FREE";
  const planMeta = PLAN_META[plan] ?? PLAN_META.FREE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        description="账号、订阅方案与本月用量。"
        actions={<LogoutButton />}
      />

      {/* 账号 */}
      <section className="dk-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <User className="h-4 w-4 text-zinc-400" /> 账号
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-2xs text-zinc-400">昵称</div>
            <div className="mt-0.5 text-sm font-medium text-ink">{user.name || "未设置"}</div>
          </div>
          <div>
            <div className="text-2xs text-zinc-400">手机号</div>
            <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
              <Phone className="h-3.5 w-3.5 text-zinc-400" />
              {user.phone || "—"}
            </div>
          </div>
          <div>
            <div className="text-2xs text-zinc-400">工作台</div>
            <div className="mt-0.5 text-sm font-medium text-ink">{workspace.name}</div>
          </div>
        </div>
      </section>

      {/* 订阅方案 */}
      <section className="dk-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CreditCard className="h-4 w-4 text-zinc-400" /> 订阅方案
            <Badge tone={planMeta.tone}>{planMeta.label}</Badge>
            {usage?.planExpiresAt && (
              <span className="inline-flex items-center gap-1 text-2xs text-zinc-400">
                <CalendarClock className="h-3 w-3" />
                {new Date(usage.planExpiresAt).toLocaleDateString("zh-CN")} 到期
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {plan !== "TEAM" && (
              <button
                onClick={() => setCheckout("TEAM")}
                className="press rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:border-brand-300 hover:text-brand-700"
              >
                升级团队版
              </button>
            )}
            {plan === "FREE" && (
              <button
                onClick={() => setCheckout("PRO")}
                className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-xs font-semibold text-white hover:bg-black"
              >
                <Sparkles className="h-3.5 w-3.5" />
                升级专业版 ¥199/月
              </button>
            )}
            {plan === "PRO" && (
              <button
                onClick={() => setCheckout("PRO")}
                className="press inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-xs font-semibold text-white hover:bg-black"
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                续费专业版
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 本月积分 */}
      <section className="dk-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Coins className="h-4 w-4 text-zinc-400" /> 本月积分
          </div>
          {usage && usage.costCents > 0 && (
            <div className="text-2xs text-zinc-400">
              本月生成成本约 ¥{(usage.costCents / 100).toFixed(2)}
            </div>
          )}
        </div>
        {usage ? (
          <CreditBalance usage={usage} />
        ) : (
          <div className="mt-4 text-sm text-zinc-400">积分数据暂不可用,稍后刷新重试。</div>
        )}
      </section>

      {checkout && (
        <CheckoutModal
          plan={checkout}
          workspaceId={workspace.id}
          onClose={() => setCheckout(null)}
        />
      )}
    </div>
  );
}

function CreditBalance({ usage }: { usage: Usage }) {
  const { used, limit } = usage.credits;
  const unlimited = limit < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const danger = !unlimited && pct >= 90;
  const remaining = unlimited ? null : Math.max(0, limit - used);
  const b = usage.breakdown;

  return (
    <div className="mt-4">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold tabular-nums text-ink">{used}</span>
          <span className="text-sm text-zinc-400"> / {unlimited ? "∞" : limit} 积分</span>
        </div>
        <div className="text-2xs text-zinc-400">
          {unlimited ? "团队版不限积分" : `本月剩余 ${remaining} 积分`}
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-zinc-200/70">
        <div
          className={`h-full rounded-full transition-all ${
            unlimited ? "w-1/12 bg-emerald-400" : danger ? "bg-rose-500" : "bg-brand-500"
          }`}
          style={unlimited ? undefined : { width: `${pct}%` }}
        />
      </div>
      {danger && (
        <div className="mt-2 text-2xs font-medium text-rose-500">
          积分告急,升级方案可继续。
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-zinc-400" />选品 {b.agentTasks} 次
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clapperboard className="h-3 w-3 text-zinc-400" />出片 {b.videos} 条
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3 text-zinc-400" />出图 {b.images} 张
        </span>
        <span className="text-zinc-300">
          (选品 {usage.creditCosts.agentTask} · 出片 {usage.creditCosts.video} · 出图{" "}
          {usage.creditCosts.image} 积分)
        </span>
      </div>
    </div>
  );
}
