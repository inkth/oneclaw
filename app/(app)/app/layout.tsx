import Link from "next/link";
import { getMe, apiServer } from "@/lib/api-client";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { BrandTile } from "@/components/ui/BrandMark";
import { SidebarNav, BoardTabs } from "./_nav";
import { ConversationRail } from "./conversation-rail";
import { AppHeader } from "./app-header";
import type { Usage } from "./settings/settings-client";

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

  // 顶栏要显示积分余额/套餐:登录后取用量;失败则降级(不显示积分,仍可升级)。
  let usage: Usage | null = null;
  if (workspace) {
    try {
      const d = await apiServer<{ usage: Usage }>(`/workspaces/${workspace.id}/usage`);
      usage = d.usage;
    } catch {
      usage = null;
    }
  }

  return (
    <AuthModalProvider>
    <div className="app-skin min-h-screen flex bg-background">
      {/* 照搬 Designkit：80px 图标导航轨，透明贴画布色，纵向 图标+小字 */}
      <aside className="hidden md:flex sticky top-0 h-screen w-20 shrink-0 flex-col items-center self-start overflow-y-auto border-r border-black/5 bg-transparent py-4">
        <Link href="/" aria-label="发现猫 首页" className="block">
          <BrandTile className="h-10 w-10 rounded-2xl" />
        </Link>

        <SidebarNav />
      </aside>

      {/* 会话列表面板:仅「会话」板块(/app/agents*)出现,自身按路由判断,其它板块返回 null */}
      <ConversationRail workspaceId={workspace?.id ?? ""} />

      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader
          loggedIn={!!user}
          display={display}
          plan={usage?.plan ?? null}
          creditsUsed={usage?.credits.used ?? null}
          creditsLimit={usage?.credits.limit ?? null}
        />
        <main className="relative flex-1 p-4 sm:p-8">
          {/* 活力氛围:全工作台顶部极淡 violet/fuchsia 柔光,统一去「纯白感」 */}
          <div
            aria-hidden
            className="gradient-bg pointer-events-none absolute inset-x-0 top-0 h-72 opacity-70"
          />
          <div className="relative">
            {/* 桌面端二级 Tab 已融进顶栏 AppHeader；这里只在移动端兜底显示 Tab 行 */}
            <div className="md:hidden">
              <BoardTabs />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
    </AuthModalProvider>
  );
}
