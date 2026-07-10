import { ArrowRight, Languages, Sparkles, Wallet } from "lucide-react";

/* 收尾 CTA：深色舱体 + 三条新手保证。
   面向「第一次出海」的人，把门槛说清楚比喊口号更有说服力。 */

const PROMISES = [
  { icon: Languages, text: "全中文界面，一句话派活" },
  { icon: Sparkles, text: "不需要团队，也不需要经验" },
  { icon: Wallet, text: "Beta 期免费，手机号登录即用" },
];

export function FinalCTA() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Designkit 画布是平的：去掉原来的氛围光晕 blur 团，深色舱体本身足够聚焦视线 */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-950 px-6 py-16 text-center sm:px-12 sm:py-20">
          <div className="relative">
            <h2 className="text-display-sm text-white">
              第一单出海生意，今天就跑起来
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400 text-cjk-relaxed">
              新用户自动开通工作台，进去先给 Agent 派个活——
              十分钟后回来，看看它替你做了什么。
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/app"
                className="pop group inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3.5 text-sm font-semibold text-zinc-900 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]"
              >
                免费开始体验
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/5"
              >
                查看定价
              </a>
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 text-xs text-zinc-400 sm:flex-row sm:gap-8">
              {PROMISES.map((p) => (
                <span key={p.text} className="inline-flex items-center gap-2">
                  <p.icon className="h-3.5 w-3.5 text-brand-400" />
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
