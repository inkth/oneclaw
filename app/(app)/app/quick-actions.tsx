"use client";

import { toast } from "sonner";
import {
  BarChart3,
  Clapperboard,
  Images,
  LayoutPanelTop,
  LineChart,
  Search,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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

/**
 * 快捷场景卡按 Agent 分组:切换上方胶囊时,这排卡跟着换成当前 Agent 的常用场景。
 * 键覆盖全部 ComposerKind(选品/视频/Listing/试穿/复盘);试穿走 composer 内联选择,无快捷卡。
 */
const QUICK_ACTIONS_BY_AGENT: Record<ComposerKind, QuickAction[]> = {
  ANALYST: [
    {
      key: "analyst-bluesea",
      title: "蓝海选品",
      desc: "低竞争 + 上升趋势新品",
      icon: Search,
      thumb: "from-brand-400 to-indigo-400",
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
      thumb: "from-rose-400 to-orange-400",
      status: "live",
      agent: "ANALYST",
      promptTemplate: "拆解「」这款商品:核心卖点、定价策略、目标人群与我可切入的差异化机会",
    },
    {
      key: "analyst-trend",
      title: "类目趋势",
      desc: "近 30 天热度与细分机会",
      icon: TrendingUp,
      thumb: "from-emerald-400 to-teal-400",
      status: "live",
      agent: "ANALYST",
      promptTemplate: "分析「」类目近 30 天 TikTok 热度趋势,指出值得切入的细分赛道与代表爆品",
    },
    {
      key: "analyst-margin",
      title: "利润测算",
      desc: "到手成本与毛利空间",
      icon: Wallet,
      thumb: "from-sky-400 to-cyan-400",
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
      thumb: "from-fuchsia-400 to-pink-400",
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条 UGC 风格 TikTok 带货短视频,真人开箱口播感,突出使用前后对比",
    },
    {
      key: "video-painpoint",
      title: "痛点种草",
      desc: "先戳痛点再给解决方案",
      icon: Sparkles,
      thumb: "from-violet-400 to-purple-400",
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条痛点切入的 TikTok 种草短视频:先放大用户痛点,再给出产品解决方案",
    },
    {
      key: "video-beforeafter",
      title: "效果对比",
      desc: "使用前后反差带货",
      icon: Video,
      thumb: "from-amber-400 to-orange-400",
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成使用前后对比的带货短视频脚本,突出效果反差与即时转化引导",
    },
    {
      key: "video-quicksell",
      title: "卖点速览",
      desc: "15 秒快节奏卖点",
      icon: Clapperboard,
      thumb: "from-sky-400 to-blue-400",
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
      thumb: "from-emerald-400 to-lime-400",
      status: "live",
      agent: "LISTING",
      promptTemplate:
        "为「」生成 TikTok Shop Listing:商品标题、五点卖点、主图方案(英文出图 prompt)、推荐标签",
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
      key: "listing-title",
      title: "标题优化",
      desc: "关键词 + 搜索权重",
      icon: Tag,
      thumb: "from-fuchsia-400 to-violet-400",
      status: "live",
      agent: "LISTING",
      promptTemplate: "为「」优化 TikTok Shop 商品标题,覆盖高搜索量关键词并兼顾可读性,给 3 个版本",
    },
  ],
  TRYON: [],
  REVIEW: [
    {
      key: "review-stoploss",
      title: "止损诊断",
      desc: "低 ROI 素材停还是改",
      icon: BarChart3,
      thumb: "from-emerald-400 to-teal-400",
      status: "live",
      agent: "REVIEW",
      promptTemplate: "重点看 ROI 低于 2 的素材,逐条判断该停投还是优化,并说明依据",
    },
    {
      key: "review-scaleup",
      title: "加投建议",
      desc: "找赢家素材放量",
      icon: TrendingUp,
      thumb: "from-brand-400 to-indigo-400",
      status: "live",
      agent: "REVIEW",
      promptTemplate: "找出表现最好的素材与人群,给出加投预算与放量节奏建议",
    },
    {
      key: "review-funnel",
      title: "漏斗体检",
      desc: "定位掉量环节",
      icon: LineChart,
      thumb: "from-sky-400 to-cyan-400",
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
  onPick,
}: {
  activeAgent: ComposerKind;
  onPick: (a: QuickAction) => void;
}) {
  const actions = QUICK_ACTIONS_BY_AGENT[activeAgent] ?? [];
  if (actions.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {actions.map((a) => {
        const soon = a.status === "soon";
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
              <div className="text-sm font-semibold text-ink">{a.title}</div>
              <div className="mt-1 text-xs leading-snug text-zinc-500">{a.desc}</div>
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
