"use client";

import { toast } from "sonner";
import {
  BarChart3,
  BookOpen,
  Clapperboard,
  Compass,
  Images,
  LayoutPanelTop,
  LineChart,
  Route,
  Search,
  Shirt,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { ComposerKind, ListingMode } from "./agent-composer";

export type QuickAction = {
  key: string;
  title: string;
  desc: string;
  /** 缩略 tile:渐变底 + 白色线性图标(app icon 风格,不用 emoji / 图片资源)。 */
  icon: LucideIcon;
  status: "live" | "soon";
  agent?: ComposerKind;
  promptTemplate?: string;
  /** Listing 卡专用:点选切到指定子模式(上身图卡切 tryon,文案卡回 copy)。 */
  listingMode?: ListingMode;
};

/**
 * 快捷场景卡按 Agent 分组:切换上方胶囊时,这排卡跟着换成当前 Agent 的常用场景。
 * 键覆盖全部 ComposerKind(选品/视频/Listing/试穿/复盘);试穿走 composer 内联选择,无快捷卡。
 */
const QUICK_ACTIONS_BY_AGENT: Record<ComposerKind, QuickAction[]> = {
  ADVISOR: [
    {
      key: "advisor-route",
      title: "起步路线",
      desc: "结合预算排先后顺序",
      icon: Route,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "预算「」元,没有货源,想做美国市场,帮我排一条起步路线",
    },
    {
      key: "advisor-cost",
      title: "成本摸底",
      desc: "起步到底要花多少钱",
      icon: Wallet,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "做 TikTok Shop 美区,从开店到出第一单大概要准备多少钱?都花在哪些地方?",
    },
    {
      key: "advisor-term",
      title: "术语扫盲",
      desc: "行业黑话一次讲明白",
      icon: BookOpen,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "用大白话解释:全托管、POP 自运营、GMV Max、ROI 分别是什么?新手该走哪条路?",
    },
    {
      key: "advisor-next",
      title: "下一步干嘛",
      desc: "按你的进度给建议",
      icon: Compass,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "我目前已经「」,下一步该干什么?帮我理一下",
    },
  ],
  ANALYST: [
    {
      key: "analyst-bluesea",
      title: "蓝海选品",
      desc: "低竞争 + 上升趋势新品",
      icon: Search,
      status: "live",
      agent: "ANALYST",
      promptTemplate:
        "帮我找「」市场本周值得切入的潜力新品:毛利 40%+、竞争度低、月销 1K–5K 且呈上升趋势",
    },
    {
      key: "analyst-competitor",
      title: "竞品拆解",
      desc: "卖点 / 定价 / 差异化机会",
      icon: Target,
      status: "live",
      agent: "ANALYST",
      promptTemplate: "拆解「」这款商品:核心卖点、定价策略、目标人群与我可切入的差异化机会",
    },
    {
      key: "analyst-trend",
      title: "类目趋势",
      desc: "近 30 天热度与细分机会",
      icon: TrendingUp,
      status: "live",
      agent: "ANALYST",
      promptTemplate: "分析「」类目近 30 天 TikTok 热度趋势,指出值得切入的细分赛道与代表爆品",
    },
    {
      key: "analyst-margin",
      title: "利润测算",
      desc: "到手成本与毛利空间",
      icon: Wallet,
      status: "live",
      agent: "ANALYST",
      promptTemplate: "为「」估算面向「」市场的到手成本、合理定价区间与毛利空间",
    },
  ],
  DIRECTOR: [
    {
      key: "ugc-video",
      title: "UGC 开箱",
      desc: "真人开箱口播感带货",
      icon: Clapperboard,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条 UGC 风格 TikTok 带货短视频,真人开箱口播感,突出使用前后对比",
    },
    {
      key: "video-painpoint",
      title: "痛点种草",
      desc: "先戳痛点再给解决方案",
      icon: Sparkles,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条痛点切入的 TikTok 种草短视频:先放大用户痛点,再给出产品解决方案",
    },
    {
      key: "video-beforeafter",
      title: "效果对比",
      desc: "使用前后反差带货",
      icon: Video,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成使用前后对比的带货短视频脚本,突出效果反差与即时转化引导",
    },
    {
      key: "video-quicksell",
      title: "卖点速览",
      desc: "15 秒快节奏卖点",
      icon: Clapperboard,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条 15 秒卖点速览短视频,快节奏罗列核心优势,结尾强 CTA",
    },
  ],
  LISTING: [
    {
      key: "listing-set",
      title: "Listing 图集",
      desc: "标题 + 五点卖点 + 主图方案",
      icon: Images,
      status: "live",
      agent: "LISTING",
      listingMode: "copy",
      promptTemplate:
        "为「」生成 TikTok Shop Listing:商品标题、五点卖点、主图方案(英文出图 prompt)、推荐标签",
    },
    {
      key: "aplus",
      title: "A+ 内容",
      desc: "图文详情页结构化生成",
      icon: LayoutPanelTop,
      status: "live",
      agent: "LISTING",
      listingMode: "copy",
      promptTemplate:
        "为「」生成 A+ 图文详情:分模块的卖点图文结构(每模块标题 + 文案 + 配图英文 prompt)",
    },
    {
      key: "listing-title",
      title: "标题优化",
      desc: "关键词 + 搜索权重",
      icon: Tag,
      status: "live",
      agent: "LISTING",
      listingMode: "copy",
      promptTemplate: "为「」优化 TikTok Shop 商品标题,覆盖高搜索量关键词并兼顾可读性,给 3 个版本",
    },
    {
      // 上身图:并入 Listing 的 tryon 子模式,点选切到 composer 内联的「选模特 + 服饰图」。
      key: "tryon",
      title: "上身图",
      desc: "真人模特上身效果图",
      icon: Shirt,
      status: "live",
      agent: "LISTING",
      listingMode: "tryon",
    },
  ],
  TRYON: [],
  REVIEW: [
    {
      key: "review-stoploss",
      title: "止损诊断",
      desc: "低 ROI 素材停还是改",
      icon: BarChart3,
      status: "live",
      agent: "REVIEW",
      promptTemplate: "重点看 ROI 低于 2 的素材,逐条判断该停投还是优化,并说明依据",
    },
    {
      key: "review-scaleup",
      title: "加投建议",
      desc: "找赢家素材放量",
      icon: TrendingUp,
      status: "live",
      agent: "REVIEW",
      promptTemplate: "找出表现最好的素材与人群,给出加投预算与放量节奏建议",
    },
    {
      key: "review-funnel",
      title: "漏斗体检",
      desc: "定位掉量环节",
      icon: LineChart,
      status: "live",
      agent: "REVIEW",
      promptTemplate: "诊断各素材的 CTR / 加购 / 转化漏斗,定位掉量环节并给优化方向",
    },
  ],
};

/**
 * 对标竞品的快捷功能卡行:跟随当前 Agent 切换卡组。
 * 点 live 卡选中对应 Agent 并预填模板;soon 卡提示打磨中。
 */
export function QuickActionCards({
  activeAgent,
  listingMode,
  onPick,
}: {
  activeAgent: ComposerKind;
  listingMode?: ListingMode;
  onPick: (a: QuickAction) => void;
}) {
  const actions = QUICK_ACTIONS_BY_AGENT[activeAgent] ?? [];
  if (actions.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {actions.map((a) => {
        const soon = a.status === "soon";
        // 上身图卡是子模式开关:处于该模式时高亮,提示当前正在做上身图。
        const active = a.listingMode === "tryon" && listingMode === "tryon";
        return (
          <button
            key={a.key}
            onClick={() => {
              if (soon) {
                toast("该功能打磨中,敬请期待");
                return;
              }
              onPick(a);
            }}
            className={`dk-card lift relative flex min-h-[5.25rem] items-center justify-between gap-3 p-4 text-left ${
              soon ? "opacity-70" : ""
            } ${active ? "ring-2 ring-brand-400" : ""}`}
          >
            {soon && (
              <span className="absolute -top-2 right-2">
                <Badge tone="neutral" outline={false}>
                  即将上线
                </Badge>
              </span>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{a.title}</div>
              <div className="mt-1 text-xs leading-snug text-zinc-500">{a.desc}</div>
            </div>
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 text-white shadow-sm"
            >
              <a.icon className="h-5 w-5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
