"use client";

import { toast } from "sonner";
import { Clapperboard, Images, LayoutPanelTop, Shirt, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { ComposerKind } from "./agent-composer";

export type QuickAction = {
  key: string;
  title: string;
  desc: string;
  /** 缩略 tile:渐变底 + 白色线性图标(app icon 风格,不用 emoji / 图片资源)。 */
  icon: LucideIcon;
  thumb: string;
  status: "live" | "soon";
  agent?: ComposerKind;
  promptTemplate?: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "listing-set",
    title: "Listing 图集",
    desc: "标题 + 五点卖点 + 主图方案",
    icon: Images,
    thumb: "from-emerald-400 to-lime-400",
    status: "live",
    agent: "LISTING",
    promptTemplate:
      "为「」生成 TikTok Shop Listing:商品标题、五点卖点、主图方案(英文出图 prompt)、推荐标签",
  },
  {
    key: "try-on",
    title: "虚拟试穿",
    desc: "模特上身图,服饰类专用",
    icon: Shirt,
    thumb: "from-sky-400 to-cyan-400",
    status: "soon",
  },
  {
    key: "aplus",
    title: "A+ 内容",
    desc: "图文详情页结构化生成",
    icon: LayoutPanelTop,
    thumb: "from-orange-400 to-rose-400",
    status: "live",
    agent: "LISTING",
    promptTemplate:
      "为「」生成 A+ 图文详情:分模块的卖点图文结构(每模块标题 + 文案 + 配图英文 prompt)",
  },
  {
    key: "ugc-video",
    title: "UGC 视频生成",
    desc: "真人开箱口播感带货短视频",
    icon: Clapperboard,
    thumb: "from-fuchsia-400 to-pink-400",
    status: "live",
    agent: "DIRECTOR",
    promptTemplate: "为「」生成一条 UGC 风格 TikTok 带货短视频,真人开箱口播感,突出使用前后对比",
  },
];

/** 对标竞品的快捷功能卡行:点 live 卡选中对应 Agent 并预填模板;soon 卡提示打磨中。 */
export function QuickActionCards({ onPick }: { onPick: (a: QuickAction) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {QUICK_ACTIONS.map((a) => {
        const soon = a.status === "soon";
        return (
          <button
            key={a.key}
            onClick={() => {
              if (soon) {
                toast("虚拟试穿打磨中,先去「资产 → 模特」准备素材");
                return;
              }
              onPick(a);
            }}
            className={`dk-card lift relative flex items-center justify-between gap-3 p-3.5 text-left ${
              soon ? "opacity-70" : ""
            }`}
          >
            {soon && (
              <span className="absolute -top-2 right-2">
                <Badge tone="neutral" outline={false}>
                  即将上线
                </Badge>
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{a.title}</div>
              <div className="mt-1 truncate text-xs text-zinc-500">{a.desc}</div>
            </div>
            <span
              aria-hidden
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${a.thumb}`}
            >
              <a.icon className="h-5 w-5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
