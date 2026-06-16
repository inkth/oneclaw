"use client";

import Link from "next/link";
import { Sparkles, User } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { BoardHeaderNav } from "./_nav";

/**
 * 右侧主区的常驻顶栏：磨砂玻璃、无分界线，随页面一起下滑时贴顶。
 * 左：移动端品牌 / 桌面端当前板块名(轻量上下文锚点，不重复页面 H1)。
 * 右：账户区——从侧栏底部上移到右上角，符合 SaaS 习惯；游客显示登录入口。
 * 刻意不画 border，仅靠半透明 + backdrop-blur 与内容自然过渡。
 */
export function AppHeader({
  loggedIn,
  display,
}: {
  loggedIn: boolean;
  display: string;
}) {
  const { open } = useAuthModal();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 bg-background/60 px-4 backdrop-blur-md sm:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/app"
          aria-label="OneClaw 首页"
          className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 md:hidden"
        >
          <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </Link>
        <BoardHeaderNav />
      </div>

      <div className="flex items-center gap-2">
        {loggedIn ? (
          <>
            <div
              title={display}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-violet-500 text-xs font-semibold text-white"
            >
              {display.charAt(0).toUpperCase()}
            </div>
            <LogoutButton />
          </>
        ) : (
          <button
            onClick={() => open()}
            className="press inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <User className="h-4 w-4" /> 登录
          </button>
        )}
      </div>
    </header>
  );
}
