"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Clapperboard,
  Boxes,
  LineChart,
  LayoutGrid,
  Settings,
} from "lucide-react";

type Tab = { label: string; href: string };

type Board = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string; // 点击板块进入的落地页
  paths: string[]; // 属于该板块的路由前缀（用于高亮 / 归属判断）
  tabs: Tab[]; // 板块内的二级 Tab（少于 2 个则不显示 Tab 栏）
  soon?: boolean; // 功能尚未完成，标「即将上线」
};

// TikTok 电商全流程的六大板块：工作台 → 选品 → 创作 → 资产 → 复盘 → 服务。
// 所有现有页面都归进某个板块，子页面收进板块内 Tab，侧边栏永远只有这 6 行 + 设置。
const BOARDS: Board[] = [
  {
    // 工作台的核心是 Agent：首页直接呈现/进入 Agent，不用 Tab 切换。
    // /app/agents 仍归属工作台（侧边栏高亮工作台），通过首页入口进入。
    key: "workspace",
    label: "工作台",
    icon: LayoutDashboard,
    href: "/app",
    paths: ["/app", "/app/agents"],
    tabs: [],
  },
  {
    key: "discover",
    label: "选品",
    icon: Compass,
    href: "/app/discover/products",
    paths: ["/app/discover"],
    tabs: [{ label: "TikTok 爆品", href: "/app/discover/products" }],
  },
  {
    key: "create",
    label: "创作",
    icon: Clapperboard,
    href: "/app/create",
    paths: ["/app/create", "/app/videos"],
    tabs: [
      { label: "创作工坊", href: "/app/create" },
      { label: "短视频", href: "/app/videos" },
    ],
  },
  {
    key: "assets",
    label: "资产",
    icon: Boxes,
    href: "/app/assets/shops",
    paths: ["/app/assets"],
    tabs: [
      { label: "店铺", href: "/app/assets/shops" },
      { label: "商品", href: "/app/assets/products" },
      { label: "模特", href: "/app/assets/models" },
      { label: "素材库", href: "/app/assets/materials" },
    ],
  },
  {
    key: "review",
    label: "复盘",
    icon: LineChart,
    href: "/app/analytics",
    paths: ["/app/analytics"],
    tabs: [],
    soon: true,
  },
  {
    key: "services",
    label: "服务",
    icon: LayoutGrid,
    href: "/app/services",
    paths: ["/app/services"],
    tabs: [],
    soon: true,
  },
];

const settingsItem = { href: "/app/settings", label: "设置", icon: Settings };

function matchPath(prefix: string, pathname: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// 找出当前路由归属的板块。工作台用精确匹配（'/app' 是所有路由的前缀），
// 其余板块用前缀匹配，所以先匹配非工作台板块。
function activeBoard(pathname: string): Board | undefined {
  if (pathname === "/app") return BOARDS[0];
  return BOARDS.find((b) =>
    b.paths.some((p) => p !== "/app" && matchPath(p, pathname))
  );
}

const itemBase =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors";

export function SidebarNav() {
  const pathname = usePathname();
  const active = activeBoard(pathname);

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2 flex flex-col">
      <div className="space-y-0.5">
        {BOARDS.map((board) => {
          const Icon = board.icon;
          const isActive = active?.key === board.key;
          return (
            <Link
              key={board.key}
              href={board.href}
              className={
                itemBase +
                (isActive
                  ? " bg-indigo-50 text-indigo-600 font-medium"
                  : " text-zinc-700 hover:bg-zinc-50 hover:text-indigo-600")
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{board.label}</span>
              {board.soon && (
                <span className="rounded px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 bg-zinc-100">
                  即将上线
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto pt-2">
        <Link
          href={settingsItem.href}
          className={
            itemBase +
            (matchPath(settingsItem.href, pathname)
              ? " bg-indigo-50 text-indigo-600 font-medium"
              : " text-zinc-700 hover:bg-zinc-50 hover:text-indigo-600")
          }
        >
          <settingsItem.icon className="h-4 w-4" />
          {settingsItem.label}
        </Link>
      </div>
    </nav>
  );
}

// 板块内的二级 Tab 栏，放在主内容区顶部。根据当前路由自动显示对应板块的 Tab，
// 单 Tab 板块（如选品）不渲染，避免冗余。
export function BoardTabs() {
  const pathname = usePathname();
  const board = activeBoard(pathname);
  if (!board || board.tabs.length < 2) return null;

  // 取匹配到的最长 href 作为当前 Tab，避免 '/app' 在 '/app/agents' 上也被点亮。
  const activeTabHref = board.tabs
    .filter((t) => matchPath(t.href, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="mb-6 flex items-center gap-1 border-b border-zinc-200">
      {board.tabs.map((tab) => {
        const isActive = tab.href === activeTabHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "px-3 py-2 text-sm -mb-px border-b-2 transition-colors " +
              (isActive
                ? "border-indigo-500 text-indigo-600 font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-800")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
