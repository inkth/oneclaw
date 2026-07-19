"use client";

import { toast } from "sonner";
import {
  BarChart3,
  BookOpen,
  Calculator,
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
import { AGENT_IDENTITY, type AgentKey } from "@/lib/ui/tokens";
import type { ComposerKind } from "./agent-composer";

export type QuickAction = {
  key: string;
  title: string;
  desc: string;
  /** 缩略 tile:渐变底 + 白色线性图标（app icon 风格，不用 emoji / 图片资源）。 */
  icon: LucideIcon;
  status: "live" | "soon";
  agent?: ComposerKind;
  promptTemplate?: string;
};

/**
 * 快捷场景卡按 Agent 分组：切换上方胶囊时，这排卡跟着换成当前 Agent 的常用场景。
 * 键覆盖全部 ComposerKind(选品/视频/Listing/试穿/复盘);试穿走 composer 内联选择，无快捷卡。
 */
const QUICK_ACTIONS_BY_AGENT: Record<ComposerKind, QuickAction[]> = {
  ADVISOR: [
    {
      key: "advisor-route",
      title: "起步路线",
      desc: "按预算拆出第一步",
      icon: Route,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "预算「」元，没有货源，想做美国市场，帮我排一条起步路线",
    },
    {
      key: "advisor-cost",
      title: "启动预算",
      desc: "看清钱要花在哪里",
      icon: Wallet,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "做 TikTok Shop 美区，从开店到出第一单大概要准备多少钱？都花在哪些地方？",
    },
    {
      key: "advisor-term",
      title: "术语翻译",
      desc: "把行业黑话讲明白",
      icon: BookOpen,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "用大白话解释：全托管、POP 自运营、GMV Max、ROI 分别是什么？新手该走哪条路？",
    },
    {
      key: "advisor-next",
      title: "下一步建议",
      desc: "按当前进度继续走",
      icon: Compass,
      status: "live",
      agent: "ADVISOR",
      promptTemplate: "我目前已经「」，下一步该干什么？帮我理一下",
    },
  ],
  ANALYST: [
    {
      key: "analyst-bluesea",
      title: "找潜力新品",
      desc: "低竞争、趋势向上",
      icon: Search,
      status: "live",
      agent: "ANALYST",
      promptTemplate: "帮我找「」市场本周值得切入的潜力新品：毛利 40%+、竞争度低、月销 1K–5K 且呈上升趋势",
    },
    {
      key: "analyst-competitor",
      title: "拆解竞品",
      desc: "看卖点、定价和机会",
      icon: Target,
      status: "live",
      agent: "ANALYST",
      promptTemplate: "拆解「」这款商品：核心卖点、定价策略、目标人群与我可切入的差异化机会",
    },
    {
      key: "analyst-trend",
      title: "类目趋势",
      desc: "近 30 天热度与细分机会",
      icon: TrendingUp,
      status: "live",
      agent: "ANALYST",
      promptTemplate: "分析「」类目近 30 天 TikTok 热度趋势，指出值得切入的细分赛道与代表爆品",
    },
    {
      key: "analyst-margin",
      title: "利润测算",
      desc: "算到手成本和毛利",
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
      desc: "真人口播感的开箱视频",
      icon: Clapperboard,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条 UGC 风格 TikTok 带货短视频，真人开箱口播感，突出使用前后对比",
    },
    {
      key: "video-painpoint",
      title: "痛点种草",
      desc: "先戳痛点再给解决方案",
      icon: Sparkles,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条痛点切入的 TikTok 种草短视频：先放大用户痛点，再给出产品解决方案",
    },
    {
      key: "video-beforeafter",
      title: "效果对比",
      desc: "用前后反差突出效果",
      icon: Video,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成使用前后对比的带货短视频脚本，突出效果反差与即时转化引导",
    },
    {
      key: "video-quicksell",
      title: "卖点速览",
      desc: "15 秒讲清核心卖点",
      icon: Clapperboard,
      status: "live",
      agent: "DIRECTOR",
      promptTemplate: "为「」生成一条 15 秒卖点速览短视频，快节奏罗列核心优势，结尾强 CTA",
    },
  ],
  LISTING: [
    {
      key: "listing-set",
      title: "商品页全套",
      desc: "标题、卖点、主图一次备齐",
      icon: Images,
      status: "live",
      agent: "LISTING",
      promptTemplate: "为「」生成 TikTok Shop Listing：商品标题、五点卖点、主图方案（英文出图 prompt）、推荐标签",
    },
    {
      key: "aplus",
      title: "图文详情",
      desc: "按模块生成详情页内容",
      icon: LayoutPanelTop,
      status: "live",
      agent: "LISTING",
      promptTemplate: "为「」生成图文详情：分模块的卖点图文结构（每模块标题 + 文案 + 配图英文 prompt）",
    },
    {
      key: "listing-title",
      title: "标题优化",
      desc: "兼顾关键词和可读性",
      icon: Tag,
      status: "live",
      agent: "LISTING",
      promptTemplate: "为「」优化 TikTok Shop 商品标题，覆盖高搜索量关键词并兼顾可读性，给 3 个版本",
    },
    {
      // 上身图不再切子模式：预填意图，用户在统一「添加」里选模特和商品图。
      key: "tryon",
      title: "上身图",
      desc: "真人模特上身效果图",
      icon: Shirt,
      status: "live",
      agent: "LISTING",
      promptTemplate: "为所选商品生成完整 Listing，并附加一张所选模特的商品上身效果图",
    },
  ],
  TRYON: [],
  REVIEW: [
    {
      key: "review-stoploss",
      title: "止损诊断",
      desc: "判断低 ROI 素材停还是改",
      icon: BarChart3,
      status: "live",
      agent: "REVIEW",
      promptTemplate: "重点看 ROI 低于 2 的素材，逐条判断该停投还是优化，并说明依据",
    },
    {
      key: "review-scaleup",
      title: "加投建议",
      desc: "找到值得放量的素材",
      icon: TrendingUp,
      status: "live",
      agent: "REVIEW",
      promptTemplate: "找出表现最好的素材与人群，给出加投预算与放量节奏建议",
    },
    {
      key: "review-funnel",
      title: "漏斗体检",
      desc: "定位掉量环节",
      icon: LineChart,
      status: "live",
      agent: "REVIEW",
      promptTemplate: "诊断各素材的 CTR / 加购 / 转化漏斗，定位掉量环节并给优化方向",
    },
    {
      // 唯一不依赖报表的投前卡：先定保本线，另外三张投后卡的判断才有标尺。
      key: "review-breakeven",
      title: "保本线测算",
      desc: "算出你的止损 ROI 线",
      icon: Calculator,
      status: "live",
      agent: "REVIEW",
      promptTemplate:
        "我的商品售价「」美元，到手成本「」美元，帮我算保本 ROI 和最高能接受的出单成本，之后止损就按这条线判断",
    },
  ],
};

/**
 * 快捷功能卡行：跟随当前 Agent 切换卡组。
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {actions.map((a) => {
        const soon = a.status === "soon";
        return (
          <button
            key={a.key}
            onClick={() => {
              if (soon) {
                toast("该功能打磨中，敬请期待");
                return;
              }
              onPick(a);
            }}
            className={`group relative flex min-h-28 flex-col items-start gap-3 rounded-[18px] border border-black/[0.07] bg-white/72 p-4 text-left shadow-[0_8px_24px_-24px_rgba(18,20,25,0.55)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 sm:min-h-24 sm:flex-row sm:items-center sm:gap-3.5 ${
              soon ? "opacity-70" : ""
            } hover:-translate-y-0.5 hover:border-black/[0.13] hover:bg-white hover:shadow-[0_14px_30px_-24px_rgba(18,20,25,0.55)]`}
          >
            {soon && (
              <span className="absolute -top-2 right-2">
                <Badge tone="neutral" outline={false}>
                  即将上线
                </Badge>
              </span>
            )}
            <span
              aria-hidden
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border transition-[filter,transform] group-hover:-translate-y-0.5 group-hover:saturate-125 ${
                AGENT_IDENTITY[(a.agent ?? activeAgent) as AgentKey].iconSurface
              }`}
            >
              <a.icon className="h-5 w-5" />
            </span>
            <div className="w-full min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{a.title}</div>
              <div className="mt-1 text-xs leading-snug text-zinc-500">{a.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
