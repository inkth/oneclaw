import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Check, Sparkles, Zap, Crown, Clock } from "lucide-react";
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
  planned: string[];
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
    description: "适合个人测试 发现猫 的能力边界",
    features: [
      "每月 450 积分(≈ 2 条出片 / 150 次选品)",
      "选品 3 / 出片 175 / 出图 6 积分",
      "1 个工作台",
      "选品 / 短视频 / Listing / 复盘全功能",
      "社区 Discord 支持",
    ],
    planned: [],
    notIncluded: ["团队协作", "API 访问", "数据导出", "优先客服"],
    cta: "免费开始",
  },
  {
    name: "PRO",
    cn: "专业版",
    price: "¥199",
    priceSub: "/ 月",
    icon: Zap,
    tone: "brand",
    highlight: true,
    description: "出海个体卖家 / 独立站团队的甜点配置",
    features: [
      "每月 6000 积分(≈ 34 条出片)",
      "选品 3 / 出片 175 / 出图 6 积分",
      "选品 / 短视频 / Listing / 复盘全功能",
      "邮件客服 24h 响应",
    ],
    planned: [
      "多工作台 + 团队协作",
      "选品 CSV 导出 / 视频批量下载",
      "Webhook + REST API",
      "邮件 + 站内通知",
    ],
    notIncluded: ["私有部署", "SLA"],
    cta: "升级到 Pro",
  },
  {
    name: "TEAM",
    cn: "团队版",
    price: "¥899",
    priceSub: "/ 月起",
    icon: Crown,
    tone: "fuchsia",
    highlight: false,
    description: "MCN / 服务商 / 多品牌团队",
    features: [
      "含 30000 积分/月，超出按量计费",
      "超基线后约 ¥7.9/条出片结算",
      "选品 / 短视频 / Listing / 复盘全功能",
      "专属客户成功经理",
    ],
    planned: [
      "无限工作台 + 多成员协作",
      "细粒度角色权限 + 审计日志",
      "自定义 LLM Provider Key（BYOK）",
      "99.9% SLA",
    ],
    notIncluded: [],
    cta: "联系销售",
  },
];

const faqs = [
  {
    q: "积分怎么算？",
    a: "所有用量统一计入积分池：选品分析 / Listing 内容 / 短视频脚本各 3 积分，确认出片 175 积分/条，Listing 主图 6 积分/张。投放复盘不消耗积分。动手前按钮旁都会标出本次约消耗。",
  },
  {
    q: "积分用完了怎么办？",
    a: "Free / Pro 用完会暂停出片 / 出图等消耗积分的动作，投放复盘仍可正常使用，到期按你的计费周期(开通 / 续费日对应，非自然月)自动重置；随时可升级方案立即恢复。Team 含 30000 积分/月，超出部分按量结算（约 ¥7.9/条出片）。",
  },
  {
    q: "可以中途升级 / 降级吗？",
    a: "可以。升级即时生效，未消耗积分按比例转入新方案；降级在下个计费周期生效。",
  },
  {
    q: "支持 BYOK（自带模型 key）吗？",
    a: "BYOK 在路线图上(规划中)，将面向 Team 开放；届时 发现猫 只对编排和数据存储收费，模型成本走你自己的账户。",
  },
  {
    q: "用了 Agent 写出来的视频版权归谁？",
    a: "归你。发现猫 不主张任何素材版权，但建议你在商用前阅读相关模型服务商的服务条款。",
  },
];

const toneClass: Record<string, { ring: string; icon: string; cta: string }> = {
  zinc: {
    ring: "ring-1 ring-zinc-200/80",
    icon: "bg-[var(--dk-btn-black)]",
    cta: "bg-[var(--dk-btn-black)] hover:bg-[var(--dk-btn-black-hover)] text-white",
  },
  brand: {
    // Design Language §5：阴影最多一层极淡，去掉 shadow-xl 发光
    ring: "gradient-border shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]",
    icon: "bg-vibrant",
    cta: "bg-vibrant press text-white hover:brightness-110",
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
      <main className="flex-1">
        <section className="relative pt-16 pb-12 sm:pt-24">
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-200/60 bg-white/60 px-3 py-1 text-xs font-medium text-brand-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              试用期 14 天 · 无需信用卡
            </div>
            <h1 className="mt-6 text-display-sm">
              定价透明，<span className="gradient-text">按真实用量算</span>
            </h1>
            <p className="mt-4 text-zinc-600 max-w-2xl mx-auto text-cjk-relaxed">
              三档方案都包含全部核心功能(选品 / 短视频 / Listing / 复盘)——
              区别主要在每月给多少积分(出片 / 选品 / 出图统一从积分池扣)、超额后怎么结算。
            </p>
          </div>
        </section>

        <section className="relative pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {tiers.map((t) => {
                const c = toneClass[t.tone];
                const Icon = t.icon;
                return (
                  <div
                    key={t.name}
                    className={`relative rounded-lg bg-white p-6 sm:p-8 ${c.ring} ${
                      t.highlight ? "md:-translate-y-2" : ""
                    } transition-transform`}
                  >
                    {t.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider text-white shadow-sm">
                        <Zap className="h-3 w-3" />
                        最受欢迎
                      </div>
                    )}

                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.icon} text-white`}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="mt-5">
                      <div className="text-2xs font-mono uppercase tracking-wider text-zinc-400">
                        {t.name}
                      </div>
                      <h3 className="mt-0.5 text-xl font-bold">{t.cn}</h3>
                    </div>

                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight nums">{t.price}</span>
                      <span className="text-sm text-zinc-500">{t.priceSub}</span>
                    </div>

                    <p className="mt-3 text-sm text-zinc-600 min-h-[40px]">{t.description}</p>

                    <PricingCTA
                      plan={t.name}
                      label={t.cta}
                      className={`mt-6 inline-flex w-full items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${c.cta}`}
                    />

                    <div className="mt-6 border-t border-zinc-100 pt-5">
                      <div className="text-2xs font-medium uppercase tracking-wider text-zinc-400">
                        包含
                      </div>
                      <ul className="mt-3 space-y-2">
                        {t.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={2.5} />
                            <span className="text-zinc-700">{f}</span>
                          </li>
                        ))}
                      </ul>
                      {t.planned.length > 0 && (
                        <>
                          <div className="mt-4 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-amber-500">
                            <Clock className="h-3 w-3" />
                            规划中
                          </div>
                          <ul className="mt-3 space-y-2">
                            {t.planned.map((f) => (
                              <li key={f} className="flex items-start gap-2 text-sm">
                                <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" strokeWidth={2} />
                                <span className="text-zinc-500">{f}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
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

            <p className="mt-10 text-center text-xs text-zinc-500">
              所有方案均不含模型实际推理成本，相关费用由 发现猫
              在你的积分内代付；未来 BYOK 模式(规划中)下可走你自己的账户。
            </p>
          </div>
        </section>

        <section className="bg-zinc-50/60 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-display-sm text-center">
              常见问题
            </h2>
            <div className="mt-10 space-y-3">
              {faqs.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-lg border border-zinc-200/80 bg-white px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
                    {f.q}
                    <span className="text-zinc-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{f.a}</p>
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
