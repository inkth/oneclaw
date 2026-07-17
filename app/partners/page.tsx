import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  Copy,
  Handshake,
  Link2,
  Megaphone,
  Network,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { BrandLockup } from "@/components/ui/BrandMark";
import { CommissionCalculator, PartnerApplicationForm } from "./partner-tools";

export const metadata: Metadata = {
  title: "合作伙伴计划 · 发现猫",
  description: "加入发现猫合作伙伴计划，获得专属邀请码、客户数据与 20% 订阅分成。",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

const partnerTypes = [
  { icon: Megaphone, title: "内容创作者", text: "有出海、AI、电商或营销垂类影响力" },
  { icon: Network, title: "MCN / 社群主", text: "连接卖家、品牌方或跨境团队" },
  { icon: Building2, title: "服务商 / 咨询机构", text: "希望把 AI Agent 能力纳入客户服务" },
];

const benefits = [
  { icon: Link2, title: "专属邀请码", text: "开通后直接在产品内复制邀请链接，客户注册自动完成归因。" },
  { icon: BarChart3, title: "可视化邀请数据", text: "随时查看成功邀请用户、付费客户、佣金流水与可提现金额。" },
  { icon: WalletCards, title: "20% 付费分成", text: "被邀请客户产生符合规则的有效付费后，按实付金额计算分成。" },
  { icon: ShieldCheck, title: "清晰可追溯", text: "每笔佣金与来源订单一一对应，重复回调不会重复入账。" },
];

const steps = [
  { no: "01", title: "提交申请", text: "告诉我们你的团队、渠道和合作方向。" },
  { no: "02", title: "完成审核", text: "通过后，你的发现猫账号会开通代理身份。" },
  { no: "03", title: "分享邀请码", text: "在推广中心复制链接，分享给你的用户和客户。" },
  { no: "04", title: "查看数据与提现", text: "邀请、付费、佣金和提现状态都在产品内可查。" },
];

const faqs = [
  { q: "如何知道邀请是否成功？", a: "用代理商专属链接注册后，系统会自动建立归因。登录产品后，可在「推广」中查看成功邀请数据。" },
  { q: "20% 分成如何计算？", a: "按被邀请客户符合规则的有效付费金额计算，比例在佣金入账时固定，不会因之后的比例调整重算历史流水。" },
  { q: "什么时候能查看佣金？", a: "有效付费成功后，对应佣金流水会在推广中心中展示。提现申请和审核状态也可在同一页查看。" },
  { q: "谁适合申请？", a: "我们优先与能持续服务出海卖家的创作者、MCN、社群主、培训与咨询机构、跨境电商服务商合作。" },
];

export default function PartnersPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f7f6f2]">
        <div className="absolute inset-x-0 top-0 z-20">
          <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <BrandLockup tileClassName="h-9 w-9 rounded-[11px]" />
            <span className="rounded-full border border-black/[0.07] bg-white/70 px-3 py-1.5 text-xs font-semibold text-zinc-500 backdrop-blur">
              受邀合作伙伴通道
            </span>
          </div>
        </div>
        <section className="gradient-bg relative overflow-hidden border-b border-black/[0.06]">
          <div className="app-grid pointer-events-none absolute inset-0 opacity-35" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand-300/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-32 sm:px-6 sm:pb-28 sm:pt-36 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-32 lg:pt-40">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/75 px-3.5 py-1.5 text-xs font-bold text-brand-700 shadow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                发现猫合作伙伴计划·招募中
              </div>
              <h1 className="mt-7 max-w-3xl font-display text-5xl font-semibold leading-[1.06] tracking-[-0.045em] text-zinc-950 sm:text-6xl lg:text-7xl">
                把好产品带给客户，
                <span className="text-brand-600">让增长也回报你</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-600 sm:text-lg">
                获得专属邀请码，将发现猫 AI Agent 团队推荐给出海卖家。
                我们负责产品和交付，你获得清晰、可查、可提现的分成。
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#apply" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-sm font-bold text-white shadow-[var(--shadow-brand)] transition hover:bg-brand-700">
                  申请成为代理商
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
                {["专属邀请码", "邀请数据面板", "佣金流水可追溯"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-600" />{item}</span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:mx-0 lg:ml-auto">
              <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-brand-400/20 to-ai-violet/15 blur-2xl" />
              <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_34px_90px_-46px_rgba(36,45,95,.55)] backdrop-blur-xl sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Partner overview</div>
                    <div className="mt-1 font-display text-lg font-semibold text-zinc-950">你的推广中心</div>
                  </div>
                  <BadgeCheck className="h-7 w-7 text-brand-600" />
                </div>
                <div className="mt-7 rounded-[22px] bg-brand-950 p-5 text-white">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>专属邀请码</span><span>已开通</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3">
                    <strong className="font-mono text-xl tracking-[0.18em]">MAO2026</strong>
                    <Copy className="h-4 w-4 text-brand-200" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] border border-zinc-100 bg-white p-4">
                    <div className="text-xs text-zinc-400">成功邀请</div>
                    <div className="mt-2 font-display text-3xl font-semibold nums">128</div>
                    <div className="mt-1 text-xs text-emerald-600">本月 +24</div>
                  </div>
                  <div className="rounded-[18px] border border-zinc-100 bg-white p-4">
                    <div className="text-xs text-zinc-400">累计佣金</div>
                    <div className="mt-2 font-display text-3xl font-semibold nums">¥9,846</div>
                    <div className="mt-1 text-xs text-brand-600">明细可查</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-[18px] bg-brand-50 px-4 py-3.5">
                  <span className="text-sm font-medium text-brand-950">当前分成比例</span>
                  <strong className="font-display text-2xl text-brand-700 nums">20%</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Built for partners</div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">你专注服务客户，工具和数据交给我们</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {partnerTypes.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-[24px] border border-black/[0.07] bg-white p-6 transition hover:-translate-y-1 hover:shadow-[0_22px_60px_-44px_rgba(18,20,25,.5)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 font-display text-lg font-semibold text-zinc-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-black/[0.06] bg-white/60">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2 lg:px-8">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Everything in one place</div>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">不止一个邀请码</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">从归因、付费到提现，代理商登录产品后就能看到自己的完整数据。</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {benefits.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="rounded-[20px] border border-black/[0.06] bg-white p-5">
                    <Icon className="h-5 w-5 text-brand-600" />
                    <h3 className="mt-4 font-display font-semibold text-zinc-950">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
            <CommissionCalculator />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="flex items-end justify-between gap-8">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Simple workflow</div>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">四步开始推广</h2>
            </div>
            <Handshake className="hidden h-12 w-12 text-brand-200 sm:block" />
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {steps.map((step) => (
              <div key={step.no} className="relative rounded-[22px] border border-black/[0.07] bg-white p-5">
                <div className="font-mono text-xs font-bold tracking-wider text-brand-500">{step.no}</div>
                <h3 className="mt-8 font-display text-lg font-semibold text-zinc-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="apply" className="scroll-mt-24 border-y border-black/[0.06] bg-[#efeee8]">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[.82fr_1.18fr] lg:px-8">
            <div className="lg:pt-8">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-[var(--shadow-brand)]"><UserRoundCheck className="h-5 w-5" /></div>
              <h2 className="mt-6 font-display text-4xl font-semibold tracking-tight text-zinc-950">准备好一起增长了吗？</h2>
              <p className="mt-4 max-w-md text-base leading-7 text-zinc-600">留下你的基本信息和主要渠道。审核通过后，我们会为你开通代理身份与推广中心。</p>
              <div className="mt-8 space-y-3 text-sm text-zinc-700">
                {["实名的专属代理身份", "一键复制邀请链接", "客户与佣金数据自动统计"].map((item) => (
                  <div key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" />{item}</div>
                ))}
              </div>
            </div>
            <PartnerApplicationForm />
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">FAQ</div>
            <h2 className="mt-3 font-display text-3xl font-semibold text-zinc-950">常见问题</h2>
          </div>
          <div className="mt-10 divide-y divide-black/[0.07] border-y border-black/[0.07]">
            {faqs.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display font-semibold text-zinc-950">
                  {item.q}<span className="text-xl font-normal text-brand-500 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl pr-10 text-sm leading-7 text-zinc-600">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
    </main>
  );
}
