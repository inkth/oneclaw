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
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CheckoutModal } from "@/components/CheckoutModal";
import { LogoutButton } from "@/components/LogoutButton";
import type { Me } from "@/lib/api-client";

export type Usage = {
  plan: string;
  planExpiresAt?: string | null;
  periodStart: string;
  periodEnd: string;
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

/** 计费周期日期只显示「月/日」。 */
function fmtMD(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

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
        description="账号、订阅方案与当前周期用量。"
        actions={<LogoutButton />}
      />

      {/* 账号 */}
      <section className="dk-card p-5">
        <SectionHeader icon={User} title="账号" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-[var(--dk-content-tertiary)]">昵称</div>
            <div className="mt-0.5 text-sm font-medium text-[var(--dk-content-primary)]">{user.name || "未设置"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--dk-content-tertiary)]">手机号</div>
            <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--dk-content-primary)]">
              <Phone className="h-3.5 w-3.5 text-[var(--dk-content-tertiary)]" />
              {user.phone || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--dk-content-tertiary)]">工作台</div>
            <div className="mt-0.5 text-sm font-medium text-[var(--dk-content-primary)]">{workspace.name}</div>
          </div>
        </div>
      </section>

      {/* 订阅方案 */}
      <section className="dk-card p-5">
        <SectionHeader
          icon={CreditCard}
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              订阅方案
            <Badge tone={planMeta.tone}>{planMeta.label}</Badge>
            {usage?.planExpiresAt && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-[var(--dk-content-tertiary)]">
                <CalendarClock className="h-3 w-3" />
                {new Date(usage.planExpiresAt).toLocaleDateString("zh-CN")} 到期
              </span>
            )}
            </span>
          }
          actions={
            <>
            {plan !== "TEAM" && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setCheckout("TEAM")}
              >
                升级团队版
              </Button>
            )}
            {plan === "FREE" && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setCheckout("PRO")}
              >
                <Sparkles className="h-3.5 w-3.5" />
                升级专业版 ¥199/月
              </Button>
            )}
            {plan === "PRO" && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setCheckout("PRO")}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                续费专业版
              </Button>
            )}
            </>
          }
        />
      </section>

      {/* 本周期积分 */}
      <section className="dk-card p-5">
        <SectionHeader
          icon={Coins}
          title="本周期积分"
          meta={usage && usage.costCents > 0 ? `生成成本约 ¥${(usage.costCents / 100).toFixed(2)}` : undefined}
        />
        {usage && (
          <div className="-mt-2 text-xs text-[var(--dk-content-tertiary)]">
            计费周期 {fmtMD(usage.periodStart)} 至 {fmtMD(usage.periodEnd)}，到期自动重置额度
          </div>
        )}
        {usage ? (
          <CreditBalance usage={usage} />
        ) : (
          <div className="mt-4 text-sm text-[var(--dk-content-tertiary)]">积分数据暂不可用，稍后刷新重试。</div>
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
          <span className="nums text-2xl font-bold text-[var(--dk-content-primary)]">{used}</span>
          <span className="text-sm text-[var(--dk-content-tertiary)]"> / {unlimited ? "∞" : limit} 积分</span>
        </div>
        <div className="text-2xs text-[var(--dk-content-tertiary)]">
          {unlimited ? "团队版不限积分" : `本周期剩余 ${remaining} 积分`}
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--dk-surface-3)]">
        <div
          className={`h-full rounded-full transition-all ${
            unlimited ? "w-1/12 bg-emerald-400" : danger ? "bg-rose-500" : "bg-brand-500"
          }`}
          style={unlimited ? undefined : { width: `${pct}%` }}
        />
      </div>
      {danger && (
        <div className="mt-2 text-2xs font-medium text-rose-500">
          积分告急，升级方案可继续。
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-[var(--dk-content-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-[var(--dk-content-tertiary)]" />选品 {b.agentTasks} 次
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clapperboard className="h-3 w-3 text-[var(--dk-content-tertiary)]" />出片 {b.videos} 条
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3 text-[var(--dk-content-tertiary)]" />出图 {b.images} 张
        </span>
        <span className="text-[var(--dk-content-tertiary)]">
          (选品 {usage.creditCosts.agentTask} · 出片 {usage.creditCosts.video} · 出图{" "}
          {usage.creditCosts.image} 积分)
        </span>
      </div>
    </div>
  );
}
