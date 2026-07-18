import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Check, Sparkles, Zap, Crown, ChevronDown } from "lucide-react";
import { PricingCTA } from "./pricing-cta";

type PlanKey = "FREE" | "PRO" | "TEAM";

export const metadata = { title: "定价 · 发现猫" };

const tiers: Array<{
  name: PlanKey;
  cn: string;
  price: string;
  priceSub: string;
  icon: typeof Sparkles;
  tone: "zinc" | "brand" | "fuchsia";
  highlight: boolean;
  description: string;
  features: string[];
  notIncluded: string[];
  cta: string;
}> = [
  {
    name: "FREE",
    cn: "免费版",
    price: "¥0",
    priceSub: "永久免费",
    icon: Sparkles,
    tone: "zinc",
    highlight: false,
    description: "适合先看数据、验证方向",
    features: [
      "商品 / 店铺 / 达人 / 视频选品数据永久免费",
      "每月 450 AI 积分（≈ 1 条 8 秒出片）",
      "Agent 选品分析 3 / 出片 35 积分每秒 / 出图 6 积分",
      "1 个工作台",
      "选品 / 短视频 / Listing / 复盘全功能",
      "社区 Discord 支持",
    ],
    notIncluded: ["团队协作", "API 访问", "数据导出", "优先客服"],
    cta: "免费使用",
  },
  {
    name: "PRO",
    cn: "专业版",
    price: "¥199",
    priceSub: "/ 月",
    icon: Zap,
    tone: "brand",
    highlight: true,
    description: "适合持续选品和生产内容的个人卖家",
    features: [
      "每月 5600 积分（≈ 20 条 8 秒出片）",
      "选品 3 / 出片 35 积分每秒 / 出图 6 积分",
      "选品 / 短视频 / Listing / 复盘全功能",
      "邮件客服 24h 响应",
    ],
    notIncluded: ["私有部署", "SLA"],
    cta: "升级专业版",
  },
  {
    name: "TEAM",
    cn: "旗舰版",
    price: "¥399",
    priceSub: "/ 月起",
    icon: Crown,
    tone: "fuchsia",
    highlight: false,
    description: "适合多店铺、高频出片，用量超额也不想断供的卖家",
    features: [
      "含 11200 积分/月（≈ 40 条 8 秒出片），超出按量计费",
      "超基线按 ¥45/千积分结算（8 秒出片约 ¥12.6）",
      "选品 / 短视频 / Listing / 复盘全功能",
      "专属客户成功经理",
    ],
    notIncluded: [],
    cta: "联系销售",
  },
];

const faqs = [
  {
    q: "积分怎么算？",
    a: "浏览商品、店铺、达人和视频等选品数据永久免费，不消耗积分。调用 Agent 做选品分析 / Listing 内容 / 短视频脚本各 3 积分，确认出片按时长 35 积分/秒（默认 8 秒 ≈ 280 积分，实拍开场片段不计秒），Listing 主图 6 积分/张。投放复盘不消耗积分，动手前按钮旁都会标出本次约消耗。",
  },
  {
    q: "积分用完了怎么办？",
    a: "免费版 / 专业版用完会暂停出片 / 出图等消耗积分的动作，投放复盘仍可正常使用，到期按你的计费周期（开通 / 续费日对应，非自然月）自动重置；随时可升级方案立即恢复。旗舰版含 11200 积分/月（≈ 40 条 8 秒出片），超出部分按 ¥45/千积分结算（8 秒出片约 ¥12.6）。",
  },
  {
    q: "可以中途升级 / 降级吗？",
    a: "可以。升级即时生效，未消耗积分按比例转入新方案；降级在下个计费周期生效。",
  },
  {
    q: "用了 Agent 写出来的视频版权归谁？",
    a: "归你。发现猫不主张任何素材版权，但建议你在商用前阅读相关模型服务商的服务条款。",
  },
];

const toneClass: Record<string, { ring: string; icon: string; cta: string }> = {
  zinc: {
    ring: "ring-1 ring-zinc-200/80",
    icon: "bg-[var(--dk-btn-black)]",
    cta: "bg-[var(--dk-btn-black)] hover:bg-[var(--dk-btn-black-hover)] text-white",
  },
  brand: {
    ring: "border border-brand-300 shadow-[0_24px_60px_-44px_rgba(48,70,184,.65)]",
    icon: "bg-vibrant",
    cta: "bg-brand-600 press text-white hover:bg-brand-700",
  },
  fuchsia: {
    ring: "ring-1 ring-zinc-200/80",
    icon: "bg-[var(--dk-btn-black)]",
    cta: "bg-[var(--dk-btn-black)] hover:bg-[var(--dk-btn-black-hover)] text-white",
  },
};

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-[#f7f6f2]">
        <section className="gradient-bg relative overflow-hidden pb-10 pt-14 sm:pb-12 sm:pt-20">
          <div className="app-grid pointer-events-none absolute inset-0 opacity-35" />
          <div className="pointer-events-none absolute -right-24 top-8 h-72 w-72 rounded-full bg-brand-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-ai-violet/10 blur-3xl" />
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-200/80 bg-white/70 px-3.5 py-1.5 text-xs font-bold text-brand-700 shadow-[0_1px_2px_rgba(18,20,25,.03)] backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              选品数据永久免费 · 无需信用卡
            </div>
            <h1 className="mt-6 text-display-sm">
              选品数据永久免费，AI 按需付费
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-600 cjk-relaxed sm:text-base">
              商品、店铺、达人、视频榜单与市场数据均可免费浏览；
              只有调用 Agent 分析、出片或出图时才消耗积分。
              套餐区别仅在 AI 积分额度、用量结算和服务支持。
            </p>
          </div>
        </section>

        <section className="relative pb-20 pt-4 sm:pt-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
              {tiers.map((t) => {
                const c = toneClass[t.tone];
                const Icon = t.icon;
                return (
                  <div
                    key={t.name}
                    className={`relative flex h-full flex-col overflow-hidden rounded-[24px] bg-white p-6 sm:p-7 ${c.ring}`}
                  >
                    {t.highlight && (
                      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-brand-400 to-ai-violet" />
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.icon} text-white`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      {t.highlight && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-2xs font-bold text-brand-700">
                          <Zap className="h-3 w-3" />
                          最受欢迎
                        </span>
                      )}
                    </div>

                    <div className="mt-5">
                      <div className="text-2xs font-mono uppercase tracking-[0.14em] text-zinc-400">
                        {t.name === "TEAM" ? "FLAGSHIP" : t.name}
                      </div>
                      <h3 className="font-display mt-1 text-xl font-semibold">{t.cn}</h3>
                    </div>

                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="font-display text-4xl font-semibold tracking-[-0.035em] nums">{t.price}</span>
                      <span className="text-sm text-zinc-500">{t.priceSub}</span>
                    </div>

                    <p className="mt-3 min-h-[40px] text-sm leading-6 text-zinc-600">{t.description}</p>

                    <PricingCTA
                      plan={t.name}
                      label={t.cta}
                      className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-1 rounded-full px-4 text-sm font-bold transition-colors ${c.cta}`}
                    />

                    <div className="mt-6 flex-1 border-t border-zinc-100 pt-5">
                      <div className="text-2xs font-bold uppercase tracking-[0.12em] text-zinc-400">
                        包含
                      </div>
                      <ul className="mt-3 space-y-2.5">
                        {t.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5 text-sm leading-5">
                            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <Check className="h-2.5 w-2.5" strokeWidth={3} />
                            </span>
                            <span className="text-zinc-700">{f}</span>
                          </li>
                        ))}
                      </ul>
                      {t.notIncluded.length > 0 && (
                        <>
                          <div className="mt-4 text-2xs font-medium uppercase tracking-wider text-zinc-400">
                            不含
                          </div>
                          <ul className="mt-3 space-y-2">
                            {t.notIncluded.map((f) => (
                              <li key={f} className="flex items-start gap-2 text-sm">
                                <span className="mt-2 h-px w-3 flex-shrink-0 bg-zinc-300" />
                                <span className="text-zinc-400">{f}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mx-auto mt-8 max-w-3xl rounded-2xl border border-black/[0.06] bg-white/60 px-5 py-2.5 text-center text-xs leading-5 text-zinc-500 sm:rounded-full">
              浏览选品榜单与市场数据不消耗积分；使用 AI 时按页面标示扣除积分，
              无需另行支付模型费用。
            </p>
          </div>
        </section>

        <section className="border-t border-black/[0.05] bg-white/55 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="section-kicker">价格说明</div>
            <h2 className="mt-4 text-display-sm">
              常见问题
            </h2>
            <p className="mt-3 text-sm text-zinc-500">关于积分、升级与内容版权，先把重要问题说清楚。</p>
            <div className="mt-8 space-y-3">
              {faqs.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-[18px] border border-zinc-200/80 bg-white px-5 py-4 transition-[background-color,border-color] open:border-brand-200 open:bg-brand-50/25 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-ink">
                    {f.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 pr-8 text-sm leading-6 text-zinc-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
