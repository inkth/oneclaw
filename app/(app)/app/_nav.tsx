"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Clapperboard,
  Boxes,
  LayoutGrid,
  Settings,
} from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

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

// TikTok 电商全流程的五大板块：工作台 → 选品 → 创作 → 资产 → 服务。
// 复盘已并入工作台的「店铺投流数据分析」Agent，不再单列板块。
// 所有现有页面都归进某个板块，子页面收进板块内 Tab，侧边栏永远只有这 5 行 + 设置。
const BOARDS: Board[] = [
  {
    // 工作台即「对话板块」：首页是派活聊天框 + 最近对话，二级 Tab「全部对话」收纳全量记录。
    key: "workspace",
    label: "工作台",
    icon: LayoutDashboard,
    href: "/app",
    paths: ["/app", "/app/agents"],
    tabs: [
      { label: "工作台", href: "/app" },
      { label: "全部对话", href: "/app/agents" },
    ],
  },
  {
    key: "discover",
    label: "选品",
    icon: Compass,
    href: "/app/discover/products",
    paths: ["/app/discover"],
    tabs: [
      { label: "商品", href: "/app/discover/products" },
      { label: "店铺", href: "/app/discover/sellers" },
      { label: "达人", href: "/app/discover/influencers" },
      { label: "视频", href: "/app/discover/videos" },
      { label: "收藏", href: "/app/discover/favorites" },
    ],
  },
  {
    // 创作是单一聚焦流程，不挂二级 Tab；生成的成片归到「资产 · 短视频」。
    key: "create",
    label: "创作",
    icon: Clapperboard,
    href: "/app/create",
    paths: ["/app/create"],
    tabs: [],
  },
  {
    key: "assets",
    label: "资产",
    icon: Boxes,
    href: "/app/assets/shops",
    paths: ["/app/assets", "/app/videos"],
    tabs: [
      { label: "店铺", href: "/app/assets/shops" },
      { label: "商品", href: "/app/assets/products" },
      { label: "模特", href: "/app/assets/models" },
      { label: "素材库", href: "/app/assets/materials" },
      { label: "短视频", href: "/app/videos" },
    ],
  },
  {
    key: "services",
    label: "服务",
    icon: LayoutGrid,
    href: "/app/services",
    paths: ["/app/services"],
    tabs: [],
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

// 照搬 Designkit 图标导航轨：每项为 图标方块 + 下方小字，纵向堆叠。
// 激活项图标后有浅灰圆角底（.dk-rail-item），文字/图标转近黑。
function RailItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex w-full flex-col items-center gap-1 py-1 text-center"
    >
      <span
        className={
          "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors " +
          (active
            ? "dk-rail-item text-ink"
            : "text-zinc-500 group-hover:bg-black/[0.04] group-hover:text-ink")
        }
      >
        <Icon className="h-[22px] w-[22px]" />
      </span>
      <span
        className={
          "text-[11px] leading-none transition-colors " +
          (active ? "font-medium text-ink" : "text-zinc-500 group-hover:text-ink")
        }
      >
        {label}
      </span>
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const active = activeBoard(pathname);

  return (
    <nav className="mt-6 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1">
      {BOARDS.map((board) => (
        <RailItem
          key={board.key}
          href={board.href}
          label={board.label}
          icon={board.icon}
          active={active?.key === board.key}
        />
      ))}

      <div className="mt-auto pt-2">
        <RailItem
          href={settingsItem.href}
          label={settingsItem.label}
          icon={settingsItem.icon}
          active={matchPath(settingsItem.href, pathname)}
        />
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

  // 取匹配到的最长 href 作为当前 Tab，避免父级 href 在子页面上也被点亮。
  const activeTabHref = board.tabs
    .filter((t) => matchPath(t.href, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return <Tabs items={board.tabs} activeHref={activeTabHref} className="mb-6" />;
}
