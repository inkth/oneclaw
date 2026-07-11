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
  // 游客可浏览；无会话时 user/workspace 为 null,侧栏显示登录入口。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;
  const display = user?.name || user?.phone || user?.email || "游客";
  const isAgency = !!me?.agency && me.agency.status === "ACTIVE";
  const isAdmin = me?.role === "admin";

  // 顶栏要显示积分余额/套餐：登录后取用量；失败则降级（不显示积分，仍可升级）。
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
      {/* 照搬 Designkit 导航轨：宽 80px，底色 --dk-rail 比画布深一档 —— 靠色阶划界，
          所以没有右边框。Logo 槽 64×64，图标 28px。 */}
      <aside
        className="hidden md:flex sticky top-0 h-screen w-20 shrink-0 flex-col items-center self-start gap-2 overflow-y-auto px-2 pb-2"
        style={{ background: "var(--dk-rail)" }}
      >
        <Link
          href="/"
          aria-label="发现猫首页"
          className="flex h-16 w-16 shrink-0 items-center justify-center"
        >
          <BrandTile className="h-7 w-7 rounded-lg" />
        </Link>

        <SidebarNav isAgency={isAgency} isAdmin={isAdmin} />
      </aside>

      {/* 会话列表面板：仅「会话」板块（/app/agents*）出现，自身按路由判断，其它板块返回 null */}
      <ConversationRail workspaceId={workspace?.id ?? ""} />

      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader
          loggedIn={!!user}
          display={display}
          plan={usage?.plan ?? null}
          creditsUsed={usage?.credits.used ?? null}
          creditsLimit={usage?.credits.limit ?? null}
          isAgency={isAgency}
          isAdmin={isAdmin}
        />
        <main className="relative flex-1 p-4 sm:p-8">
          {/* Designkit 的画布是平的：唯一的色彩来自输入框背后的极光（DkAura），
              页面本身不铺任何顶部柔光。 */}
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
