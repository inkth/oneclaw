"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { BrandTile } from "@/components/ui/BrandMark";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { BoardHeaderNav } from "./_nav";
import { AccountMenu } from "./account-menu";
import { FeedbackButton } from "./feedback-button";

/**
 * 右侧主区的常驻顶栏：磨砂玻璃、无分界线，随页面一起下滑时贴顶。
 * 左：移动端品牌 / 桌面端当前板块名（轻量上下文锚点，不重复页面 H1）。
 * 右：账户区——积分余额 + 升级会员 + 头像菜单（AccountMenu）;游客显示登录入口。
 * 刻意不画 border，仅靠半透明 + backdrop-blur 与内容自然过渡。
 */
export function AppHeader({
  loggedIn,
  display,
  plan,
  creditsUsed,
  creditsLimit,
  isAgency,
  isAdmin,
  workspaceId,
}: {
  loggedIn: boolean;
  display: string;
  plan: string | null;
  creditsUsed: number | null;
  creditsLimit: number | null;
  isAgency?: boolean;
  isAdmin?: boolean;
  workspaceId?: string | null;
}) {
  const { open } = useAuthModal();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-black/[0.04] bg-background/75 px-4 backdrop-blur-xl sm:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/app" aria-label="发现猫首页" className="md:hidden">
          <BrandTile className="h-9 w-9 rounded-xl shadow-[0_8px_18px_rgba(48,70,184,.2)]" markClassName="h-[84%] w-[84%]" />
        </Link>
        <BoardHeaderNav />
      </div>

      <div className="flex items-center gap-2">
        {/* 意见反馈:仅登录用户,游客走 Footer 邮箱兜底 */}
        {loggedIn && <FeedbackButton workspaceId={workspaceId ?? null} />}
        {loggedIn ? (
          <AccountMenu
            display={display}
            plan={plan}
            creditsUsed={creditsUsed}
            creditsLimit={creditsLimit}
            isAgency={isAgency}
            isAdmin={isAdmin}
          />
        ) : (
          <button
            onClick={() => open()}
            className="press inline-flex items-center gap-1.5 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-[var(--dk-action-regular)]"
          >
            <User className="h-4 w-4" /> 登录
          </button>
        )}
      </div>
    </header>
  );
}
