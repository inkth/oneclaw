"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  MessagesSquare,
  Boxes,
  LayoutGrid,
  Settings,
  Megaphone,
  ShieldCheck,
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

// TikTok 电商全流程的五大板块：工作台 → 会话 → 资产 → 选品 → 服务。
// 工作台是统一派活台(四个 Agent 同处一框)；会话板块收纳你和 AI 的全部对话历史。
// 所有现有页面都归进某个板块，子页面收进板块内 Tab，侧边栏永远只有这 5 行 + 设置。
const BOARDS: Board[] = [
  {
    // 工作台即统一派活台：做视频 / 写 Listing / 选品分析 / 投放复盘 四个 Agent 同处一框，不挂顶部 Tab。
    // 会话历史挪到「会话」板块(/app/agents)，工作台不再带左侧会话列表。
    key: "workspace",
    label: "工作台",
    icon: LayoutDashboard,
    href: "/app",
    paths: ["/app"],
    tabs: [],
  },
  {
    // 会话板块：左侧窄会话列表(ConversationRail) + 右侧会话内容，汇总你和各 Agent 的全部对话。
    key: "conversations",
    label: "会话",
    icon: MessagesSquare,
    href: "/app/agents",
    paths: ["/app/agents"],
    tabs: [],
  },
  {
    key: "assets",
    label: "资产",
    icon: Boxes,
    href: "/app/videos",
    paths: ["/app/assets", "/app/videos"],
    tabs: [
      { label: "作品", href: "/app/videos" },
      { label: "商品", href: "/app/assets/products" },
      { label: "模特", href: "/app/assets/models" },
      { label: "素材库", href: "/app/assets/materials" },
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
    key: "services",
    label: "服务",
    icon: LayoutGrid,
    href: "/app/services",
    paths: ["/app/services"],
    tabs: [],
  },
];

const settingsItem = { href: "/app/settings", label: "设置", icon: Settings };
const agencyItem = { href: "/app/agency", label: "推广", icon: Megaphone };
const adminItem = { href: "/app/admin", label: "管理", icon: ShieldCheck };

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

/** 取当前板块内匹配到的 Tab href（取最长匹配，避免父级 href 在子页面上也被点亮）。 */
function activeTabHref(board: Board, pathname: string): string | undefined {
  return board.tabs
    .filter((t) => matchPath(t.href, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** 选品板块:把当前 region/category_id 带到各 Tab href 上,切榜不丢筛选
 *  (同一地区下 4 个榜共用同一份类目,带 category 恒有效;收藏页忽略未知 query)。
 *  返回 query 后缀,activeHref 也需拼上它——Tabs 按 href 全等判断激活态。 */
function discoverTabSuffix(sp: ReadonlyURLSearchParams): string {
  const p = new URLSearchParams();
  const region = sp.get("region");
  const category = sp.get("category_id");
  if (region) p.set("region", region);
  if (category) p.set("category_id", category);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/** 选品 Tab:把当前筛选带进各 Tab href。单独抽出且仅在选品板块渲染,
 *  使 useSearchParams 只跑在动态的选品路由上——否则会让被静态预渲染的其它板块页
 *  触发 CSR bailout(需 Suspense)。 */
function DiscoverTabs({ board, pathname, bare, className }: DiscoverTabsProps) {
  const sp = useSearchParams();
  const suffix = discoverTabSuffix(sp);
  const activeBare = activeTabHref(board, pathname);
  return (
    <Tabs
      items={suffix ? board.tabs.map((t) => ({ ...t, href: t.href + suffix })) : board.tabs}
      activeHref={activeBare ? activeBare + suffix : undefined}
      bare={bare}
      className={className}
    />
  );
}

type DiscoverTabsProps = {
  board: Board;
  pathname: string;
  bare?: boolean;
  className?: string;
};

/** useSearchParams 在静态预渲染页(收藏页无 searchParams,会被静态化)需 Suspense 兜底。
 *  fallback 用不带 query 的裸 Tab——标签/激活态一致,客户端再补上筛选后缀,视觉无差异。 */
function DiscoverTabsBoundary({ board, pathname, bare, className }: DiscoverTabsProps) {
  return (
    <Suspense
      fallback={
        <Tabs
          items={board.tabs}
          activeHref={activeTabHref(board, pathname)}
          bare={bare}
          className={className}
        />
      }
    >
      <DiscoverTabs board={board} pathname={pathname} bare={bare} className={className} />
    </Suspense>
  );
}

/** 右侧顶栏左区的导航：统一走下划线 Tabs。有二级 Tab 的板块把整排 Tab 融进顶栏（无 hairline）；
 *  无 Tab 的板块（工作台/会话/服务）渲染成单个激活项（自链接回板块落地页），与多 Tab 板块共用
 *  同一排版/基线/激活下划线，避免「居中纯文字 vs 贴底下划线 Tab」两种 header-left 模式割裂。
 *  桌面端用，移动端走 BoardTabs 行。 */
export function BoardHeaderNav() {
  const pathname = usePathname();
  const board = activeBoard(pathname);
  if (!board) return null;
  // 无二级 Tab 时，把板块名本身当作唯一一个激活 Tab（href 指回板块落地页）。
  const single = board.tabs.length < 2;
  return (
    <div className="hidden md:block">
      {board.key === "discover" ? (
        <DiscoverTabsBoundary board={board} pathname={pathname} bare />
      ) : (
        <Tabs
          items={single ? [{ label: board.label, href: board.href }] : board.tabs}
          activeHref={single ? board.href : activeTabHref(board, pathname)}
          bare
        />
      )}
    </div>
  );
}

// 照搬 Designkit 图标导航轨：每项为 图标方块 + 下方小字，纵向堆叠。
// Design Language §17：激活态是「一条紫色竖条」，不是整块紫背景——图标后只给浅灰圆角底
// （.dk-rail-item），文字/图标转近黑，品牌色只落在左缘那条竖条上。
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
      aria-current={active ? "page" : undefined}
      className="group relative flex w-full flex-col items-center gap-1 py-1 text-center"
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 h-8 w-0.5 rounded-full"
          style={{ background: "var(--accent-pop)" }}
        />
      )}
      <span
        className={
          "flex h-11 w-11 items-center justify-center rounded-2xl transition-colors " +
          (active
            ? "dk-rail-item text-ink"
            : "text-zinc-500 group-hover:bg-black/[0.04] group-hover:text-ink")
        }
      >
        <Icon className="h-5 w-5" />
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

export function SidebarNav({
  isAgency,
  isAdmin,
}: {
  isAgency?: boolean;
  isAdmin?: boolean;
}) {
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

      {/* 代理商 / 管理入口:按身份显示,不进 BOARDS(避免动 activeBoard 板块归属)。 */}
      <div className="mt-auto flex w-full flex-col items-center gap-1 pt-2">
        {isAgency && (
          <RailItem
            href={agencyItem.href}
            label={agencyItem.label}
            icon={agencyItem.icon}
            active={matchPath(agencyItem.href, pathname)}
          />
        )}
        {isAdmin && (
          <RailItem
            href={adminItem.href}
            label={adminItem.label}
            icon={adminItem.icon}
            active={matchPath(adminItem.href, pathname)}
          />
        )}
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

// 板块内的二级 Tab 栏，仅移动端用（桌面端 Tab 已融进顶栏 BoardHeaderNav）。
// 单 Tab 板块（如工作台/会话）不渲染，避免冗余。
export function BoardTabs() {
  const pathname = usePathname();
  const board = activeBoard(pathname);
  if (!board || board.tabs.length < 2) return null;
  return board.key === "discover" ? (
    <DiscoverTabsBoundary board={board} pathname={pathname} className="mb-6" />
  ) : (
    <Tabs items={board.tabs} activeHref={activeTabHref(board, pathname)} className="mb-6" />
  );
}
