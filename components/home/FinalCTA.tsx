import { ArrowRight, Languages, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";

/* 收尾 CTA：深色舱体 + 三条新手保证。
   面向「第一次出海」的人，把门槛说清楚比喊口号更有说服力。 */

const PROMISES = [
  { icon: Languages, text: "全中文操作，一句话说明目标" },
  { icon: Sparkles, text: "一个人也能跑完整流程" },
  { icon: Wallet, text: "榜单免费浏览，手机号即用" },
];

export function FinalCTA() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-brand-950 px-6 py-12 text-white shadow-[0_34px_90px_-46px_rgba(18,24,60,.95)] sm:px-10 sm:py-14 lg:px-14">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-ai-violet/25 blur-[110px]" />
          <div aria-hidden className="pointer-events-none absolute -bottom-40 left-[18%] h-72 w-72 rounded-full bg-brand-500/30 blur-[110px]" />
          <div aria-hidden className="claw-stamp pointer-events-none absolute right-12 top-10 hidden text-white/10 sm:block" />

          <div className="relative grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="text-2xs font-bold uppercase tracking-[0.18em] text-brand-300">从一个清晰目标开始</div>
              <h2 className="mt-4 max-w-3xl text-display-sm text-white">
                今天，推进你的下一门好生意
              </h2>
              <p className="mt-4 max-w-xl text-base text-white/65 cjk-relaxed">
                先免费浏览选品数据找机会，再把分析、内容或复盘交给 Agent。
                每一次操作，都更接近可执行的下一步。
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/app"
                className="pop group inline-flex min-w-40 items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-zinc-900 shadow-md"
              >
                进入工作台
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-w-40 items-center justify-center rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/[0.07]"
              >
                查看定价
              </Link>
            </div>
          </div>

          <div className="relative mt-10 grid gap-3 border-t border-white/10 pt-6 text-xs text-white/60 sm:grid-cols-3 sm:gap-6">
            {PROMISES.map((p) => (
              <span key={p.text} className="inline-flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.07] text-brand-200">
                  <p.icon className="h-3.5 w-3.5" />
                </span>
                {p.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
