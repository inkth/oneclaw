"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { BrandTile } from "@/components/ui/BrandMark";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { BoardHeaderNav } from "./_nav";
import { AccountMenu } from "./account-menu";

/**
 * 右侧主区的常驻顶栏：磨砂玻璃、无分界线，随页面一起下滑时贴顶。
 * 左：移动端品牌 / 桌面端当前板块名(轻量上下文锚点，不重复页面 H1)。
 * 右：账户区——积分余额 + 升级会员 + 头像菜单(AccountMenu);游客显示登录入口。
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
}: {
  loggedIn: boolean;
  display: string;
  plan: string | null;
  creditsUsed: number | null;
  creditsLimit: number | null;
  isAgency?: boolean;
  isAdmin?: boolean;
}) {
  const { open } = useAuthModal();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 bg-background/60 px-4 backdrop-blur-md sm:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/app" aria-label="发现猫 首页" className="md:hidden">
          <BrandTile className="h-7 w-7 rounded-xl" markClassName="h-[84%] w-[84%]" />
        </Link>
        <BoardHeaderNav />
      </div>

      <div className="flex items-center gap-2">
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
            className="press inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <User className="h-4 w-4" /> 登录
          </button>
        )}
      </div>
    </header>
  );
}
