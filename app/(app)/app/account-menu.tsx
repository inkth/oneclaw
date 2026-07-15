"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, Settings, LogOut, Sparkles, Megaphone, ShieldCheck } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { apiBrowser } from "@/lib/api-browser";

const PLAN_LABEL: Record<string, string> = { FREE: "免费版", PRO: "专业版", TEAM: "团队版" };

/**
 * 顶栏右侧账户区：积分余额 + 升级会员 + 头像下拉菜单（替代原来的独立退出图标）。
 * 桌面端把积分/升级平铺在头像左侧；移动端收进菜单，只留头像。
 * 团队版（limit<0=不限积分）不显示升级入口、积分显示 ∞。
 */
export function AccountMenu({
  display,
  plan,
  creditsUsed,
  creditsLimit,
  isAgency,
  isAdmin,
}: {
  display: string;
  plan: string | null;
  creditsUsed: number | null;
  creditsLimit: number | null;
  isAgency?: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();

  const hasCredits = creditsLimit !== null && creditsUsed !== null;
  const unlimited = hasCredits && creditsLimit! < 0;
  const remaining = hasCredits && !unlimited ? Math.max(0, creditsLimit! - creditsUsed!) : null;
  const low = remaining !== null && creditsLimit! > 0 && remaining / creditsLimit! <= 0.1;
  const isTeam = plan === "TEAM" || unlimited;
  const upgradeHref = `/app/settings?upgrade=${plan === "PRO" ? "TEAM" : "PRO"}`;

  async function logout() {
    try {
      await apiBrowser("/auth/logout", { method: "POST" });
    } catch {
      /* 即使失败也跳转 */
    }
    router.push("/");
    router.refresh();
  }

  const initial = display.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      {/* 积分余额（桌面常驻，移动端折进菜单）→ 点击进设置 */}
      {hasCredits && (
        <Link
          href="/app/settings"
          title="本周期积分余额"
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            low
              ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
              : "border-[var(--dk-stroke-border)] bg-white text-zinc-600 hover:bg-[var(--dk-action-regular)] hover:text-zinc-900"
          }`}
        >
          <Coins className="h-3.5 w-3.5" />
          {unlimited ? "积分 ∞" : `${remaining} 积分`}
        </Link>
      )}

      {/* 升级会员（非团队版才显示）*/}
      {!isTeam && (
        <Link
          href={upgradeHref}
          className="pop-cta hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          升级会员
        </Link>
      )}

      {/* 头像 → 下拉菜单 */}
      <Popover
        align="end"
        panelClassName="w-60 p-0 overflow-hidden"
        trigger={({ open }) => (
          <span
            title={display}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white transition-shadow ${
              open ? "ring-2 ring-brand-200" : ""
            }`}
          >
            {initial}
          </span>
        )}
      >
        {({ close }) => (
          <div className="text-sm">
            {/* 身份 */}
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {initial}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium text-ink" title={display}>
                  {display}
                </div>
                {plan && <div className="text-2xs text-zinc-400">{PLAN_LABEL[plan] ?? plan}</div>}
              </div>
            </div>

            {/* 积分（移动端主要靠这里看）*/}
            {hasCredits && (
              <Link
                href="/app/settings"
                onClick={close}
                className="flex items-center justify-between border-t border-[var(--dk-stroke-divider)] px-3.5 py-2.5 hover:bg-[var(--dk-action-regular)]"
              >
                <span className="inline-flex items-center gap-2 text-zinc-600">
                  <Coins className="h-4 w-4 text-zinc-400" />
                  本周期积分
                </span>
                <span className={`font-medium tabular-nums ${low ? "text-rose-600" : "text-ink"}`}>
                  {unlimited ? "∞" : remaining}
                </span>
              </Link>
            )}

            {/* 操作 */}
            <div className="border-t border-[var(--dk-stroke-divider)] py-1">
              {!isTeam && (
                <Link
                  href={upgradeHref}
                  onClick={close}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-zinc-900 hover:bg-[var(--dk-action-regular)]"
                >
                  <Sparkles className="h-4 w-4 text-brand-500" />
                  升级会员
                </Link>
              )}
              {isAgency && (
                <Link
                  href="/app/agency"
                  onClick={close}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-zinc-900 hover:bg-[var(--dk-action-regular)]"
                >
                  <Megaphone className="h-4 w-4 text-zinc-400" />
                  推广中心
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/app/admin"
                  onClick={close}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-zinc-900 hover:bg-[var(--dk-action-regular)]"
                >
                  <ShieldCheck className="h-4 w-4 text-zinc-400" />
                  管理后台
                </Link>
              )}
              <Link
                href="/app/settings"
                onClick={close}
                className="flex items-center gap-2.5 px-3.5 py-2 text-zinc-900 hover:bg-[var(--dk-action-regular)]"
              >
                <Settings className="h-4 w-4 text-zinc-400" />
                设置
              </Link>
              <button
                onClick={() => {
                  close();
                  logout();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-zinc-900 hover:bg-[var(--dk-action-regular)]"
              >
                <LogOut className="h-4 w-4 text-zinc-400" />
                退出登录
              </button>
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}
