import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  LayoutDashboard,
  Store,
  Package,
  UserSquare2,
  Image as ImageIcon,
  Video,
  Bot,
  Settings,
  Sparkles,
  LogOut,
  Compass,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "",
    items: [{ href: "/app", label: "概览", icon: LayoutDashboard }],
  },
  {
    label: "发现",
    items: [
      { href: "/app/discover/products", label: "TikTok 爆品", icon: Compass },
    ],
  },
  {
    label: "资产",
    items: [
      { href: "/app/assets/shops", label: "店铺", icon: Store },
      { href: "/app/assets/products", label: "商品", icon: Package },
      { href: "/app/assets/models", label: "模特", icon: UserSquare2 },
      { href: "/app/assets/materials", label: "素材库", icon: ImageIcon },
    ],
  },
  {
    label: "创意",
    items: [
      { href: "/app/create", label: "创作工坊", icon: Sparkles },
      { href: "/app/videos", label: "短视频", icon: Video },
    ],
  },
  {
    label: "工作流",
    items: [{ href: "/app/agents", label: "Agent", icon: Bot }],
  },
  {
    label: "",
    items: [{ href: "/app/settings", label: "设置", icon: Settings }],
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/app");
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

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
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">
              当前工作台
            </div>
            <div className="mt-0.5 text-sm font-medium truncate">
              {workspace.name}
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              方案 · {workspace.plan}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-100 p-3">
          <div className="flex items-center gap-2 mb-3 px-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-white text-xs font-semibold flex items-center justify-center">
              {(session.user.name || session.user.phone || session.user.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">
                {session.user.name || session.user.phone || session.user.email}
              </div>
              <div className="text-[10px] text-zinc-500 truncate font-mono">
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
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </button>
          </form>
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
        <main className="flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
