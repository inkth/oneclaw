import Link from "next/link";
import { getMe } from "@/lib/api-client";
import { LogoutButton } from "@/components/LogoutButton";
import { Sparkles } from "lucide-react";
import { SidebarNav, BoardTabs } from "./_nav";

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
    <div className="min-h-screen flex bg-zinc-50/50">
      <aside className="hidden md:flex w-60 flex-col border-r border-zinc-200 bg-white">
        <Link href="/" className="flex items-center gap-2 px-5 h-16 border-b border-zinc-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 via-violet-500 to-fuchsia-500">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-base font-semibold tracking-tight">
            One<span className="text-brand-600">Claw</span>
          </span>
        </Link>

        <div className="px-3 py-3 border-b border-zinc-100">
          <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">当前工作台</div>
            {workspace ? (
              <>
                <div className="mt-0.5 text-sm font-medium truncate">{workspace.name}</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">方案 · {workspace.plan}</div>
              </>
            ) : (
              <div className="mt-0.5 text-sm font-medium text-zinc-500">游客浏览中</div>
            )}
          </div>
        </div>

        <SidebarNav />

        <div className="border-t border-zinc-100 p-3">
          {user ? (
            <>
              <div className="flex items-center gap-2 mb-3 px-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 text-white text-xs font-semibold flex items-center justify-center">
                  {display.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{display}</div>
                  <div className="text-[10px] text-zinc-500 truncate font-mono">
                    {user.phone
                      ? `+86 ${user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1 **** $2")}`
                      : user.email}
                  </div>
                </div>
              </div>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login?callbackUrl=/app"
              className="block w-full rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              登录 / 注册
            </Link>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-zinc-200 bg-white">
          <Link href="/app" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold">OneClaw</span>
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
  );
}
