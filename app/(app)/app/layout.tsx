import Link from "next/link";
import { auth, signOut } from "@/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { Copilot } from "@/components/ai/copilot";
import { Sparkles, LogOut } from "lucide-react";
import { SidebarNav, BoardTabs } from "./_nav";
import { Button, ButtonLink } from "@/components/ui/Button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 不再无条件拦截：游客也能进来逛功能页（如创作工坊），
  // 真正需要账号的页面/动作各自提示登录。
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  return (
    <div className="min-h-screen flex bg-zinc-50/50">
      <aside className="hidden md:flex w-60 flex-col border-r border-zinc-200 bg-white">
        <Link href="/" className="flex items-center gap-2 px-5 h-16 border-b border-zinc-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-base font-semibold tracking-tight">
            One<span className="text-indigo-600">Claw</span>
          </span>
        </Link>

        <div className="px-3 py-3 border-b border-zinc-100">
          <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
            <div className="text-2xs uppercase tracking-wider text-zinc-400">
              {workspace ? "当前工作台" : "账户"}
            </div>
            <div className="mt-0.5 text-sm font-medium truncate">
              {workspace ? workspace.name : "未登录"}
            </div>
            <div className="mt-0.5 text-2xs text-zinc-500">
              {workspace ? `方案 · ${workspace.plan}` : "登录后解锁全部功能"}
            </div>
          </div>
        </div>

        <SidebarNav />

        <div className="border-t border-zinc-100 p-3">
          {session?.user ? (
            <>
              <div className="flex items-center gap-2 mb-3 px-2">
                <div className="h-7 w-7 rounded-full bg-zinc-900 text-white text-xs font-semibold flex items-center justify-center">
                  {(session.user.name || session.user.phone || session.user.email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {session.user.name || session.user.phone || session.user.email}
                  </div>
                  <div className="text-2xs text-zinc-500 truncate font-mono">
                    {session.user.phone
                      ? `+86 ${session.user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1 **** $2")}`
                      : session.user.email}
                  </div>
                </div>
              </div>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button type="submit" variant="secondary" size="sm" className="w-full">
                  <LogOut className="h-3.5 w-3.5" />
                  退出登录
                </Button>
              </form>
            </>
          ) : (
            <ButtonLink
              href="/login?callbackUrl=/app/create"
              variant="primary"
              size="sm"
              className="w-full"
            >
              登录 / 注册
            </ButtonLink>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-zinc-200 bg-white">
          <Link href="/app" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold">OneClaw</span>
          </Link>
        </header>
        <main className="flex-1 p-4 sm:p-8">
          <BoardTabs />
          {children}
        </main>
      </div>

      {session?.user && <Copilot />}
    </div>
  );
}
