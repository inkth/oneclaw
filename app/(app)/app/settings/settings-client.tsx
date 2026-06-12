"use client";

import { useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  Clapperboard,
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
  agentTasks: { used: number; limit: number };
  videos: { used: number; limit: number };
  images: { used: number; limit: number };
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

      {/* 本月用量 */}
      <section className="dk-card p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">本月用量</div>
          {usage && usage.costCents > 0 && (
            <div className="text-2xs text-zinc-400">
              本月生成成本约 ¥{(usage.costCents / 100).toFixed(2)}
            </div>
          )}
        </div>
        {usage ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <UsageBar
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Agent 任务"
              item={usage.agentTasks}
            />
            <UsageBar
              icon={<Clapperboard className="h-3.5 w-3.5" />}
              label="视频生成"
              item={usage.videos}
            />
            <UsageBar
              icon={<ImageIcon className="h-3.5 w-3.5" />}
              label="出图"
              item={usage.images}
            />
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-400">用量数据暂不可用,稍后刷新重试。</div>
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

function UsageBar({
  icon,
  label,
  item,
}: {
  icon: React.ReactNode;
  label: string;
  item: { used: number; limit: number };
}) {
  const unlimited = item.limit < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((item.used / Math.max(1, item.limit)) * 100));
  const danger = !unlimited && pct >= 90;
  return (
    <div className="rounded-xl border border-black/5 bg-zinc-50/60 p-3.5">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600">
          <span className="text-zinc-400">{icon}</span>
          {label}
        </div>
        <div className="text-xs tabular-nums text-zinc-500">
          {item.used}
          <span className="text-zinc-300"> / {unlimited ? "∞" : item.limit}</span>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-200/70">
        <div
          className={`h-full rounded-full transition-all ${
            unlimited ? "w-1/12 bg-emerald-400" : danger ? "bg-rose-500" : "bg-brand-500"
          }`}
          style={unlimited ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
