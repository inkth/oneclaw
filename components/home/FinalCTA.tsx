import { ArrowRight, Languages, Sparkles, Wallet } from "lucide-react";

/* 收尾 CTA：深色舱体 + 三条新手保证。
   面向「第一次出海」的人，把门槛说清楚比喊口号更有说服力。 */

const PROMISES = [
  { icon: Languages, text: "全中文操作，一句话说明目标" },
  { icon: Sparkles, text: "一个人也能跑完整流程" },
  { icon: Wallet, text: "榜单免费浏览，手机号即用" },
];

export function FinalCTA() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-black/10 bg-brand-500 px-6 py-16 text-center shadow-xl sm:px-12 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-orange-200/35 blur-[110px]" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 right-[10%] h-64 w-64 rounded-full bg-blue-700/35 blur-[100px]" />
          <div className="relative">
            <h2 className="text-display-sm text-white">
              今天，推进你的下一门好生意
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/75 text-cjk-relaxed">
              先免费逛榜单找机会，再把选品、内容或复盘交给 Agent。
              每一次操作，都更接近可执行的下一步。
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/app"
                className="pop group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-zinc-900 shadow-md"
              >
                进入工作台
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-white/35 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/10"
              >
                查看定价
              </a>
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 text-xs text-white/70 sm:flex-row sm:gap-8">
              {PROMISES.map((p) => (
                <span key={p.text} className="inline-flex items-center gap-2">
                  <p.icon className="h-3.5 w-3.5 text-white" />
                  {p.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
