import Link from "next/link";
import { getMe } from "@/lib/api-client";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { SidebarLoginButton } from "@/components/auth/SidebarLoginButton";
import { Sparkles } from "lucide-react";
import { SidebarNav, BoardTabs } from "./_nav";
import { ConversationRail } from "./conversation-rail";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 游客可浏览;无会话时 user/workspace 为 null,侧栏显示登录入口。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;
  const display = user?.name || user?.phone || user?.email || "游客";

  return (
    <AuthModalProvider>
    <div className="app-skin min-h-screen flex bg-background">
      {/* 照搬 Designkit：80px 图标导航轨，透明贴画布色，纵向 图标+小字 */}
      <aside className="hidden md:flex sticky top-0 h-screen w-20 shrink-0 flex-col items-center self-start overflow-y-auto border-r border-black/5 bg-transparent py-4">
        <Link
          href="/"
          aria-label="OneClaw 首页"
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-sm"
        >
          <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
        </Link>

        <SidebarNav />

        <div className="mt-4 flex flex-col items-center gap-3">
          {user ? (
            <>
              <div
                title={display}
                className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 text-white text-sm font-semibold flex items-center justify-center"
              >
                {display.charAt(0).toUpperCase()}
              </div>
              <LogoutButton />
            </>
          ) : (
            <SidebarLoginButton />
          )}
        </div>
      </aside>

      {/* 会话列表面板:仅「工作台」板块出现(自身按路由判断,其它板块返回 null) */}
      <ConversationRail workspaceId={workspace?.id ?? ""} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-black/5 bg-background">
          <Link href="/app" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm font-semibold">OneClaw</span>
          </Link>
        </header>
        <main className="relative flex-1 p-4 sm:p-8">
          {/* 活力氛围:全工作台顶部极淡 violet/fuchsia 柔光,统一去「纯白感」 */}
          <div
            aria-hidden
            className="gradient-bg pointer-events-none absolute inset-x-0 top-0 h-72 opacity-70"
          />
          <div className="relative">
            <BoardTabs />
            {children}
          </div>
        </main>
      </div>
    </div>
    </AuthModalProvider>
  );
}
