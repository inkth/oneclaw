import { ArrowRight } from "lucide-react";

const avatars = [
  "from-rose-400 to-orange-400",
  "from-amber-400 to-yellow-400",
  "from-emerald-400 to-teal-400",
  "from-sky-400 to-brand-400",
  "from-violet-400 to-fuchsia-400",
];

export function CTA() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-zinc-900 px-6 py-16 sm:px-16 sm:py-20 text-center">
          <div className="relative">
            <div className="flex justify-center -space-x-2 mb-6">
              {avatars.map((a, i) => (
                <div
                  key={i}
                  className={`h-9 w-9 rounded-full bg-gradient-to-br ${a} ring-2 ring-zinc-900`}
                />
              ))}
            </div>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
              让 AI 团队替你打这场仗
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-zinc-300">
              加入 1,200+ 跨境团队，从今天起把重复劳动交给 OneClaw。
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/app/create"
                className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 transition-all shadow-xl"
              >
                免费开始体验
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-all"
              >
                预约 1:1 演示
              </a>
            </div>
            <div className="mt-6 text-xs text-zinc-400">
              无需信用卡 · 14 天免费试用 · 5 分钟接入
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
