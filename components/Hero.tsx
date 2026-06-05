import { ArrowRight, Play, Sparkles, TrendingUp, Video, Globe } from "lucide-react";

export function Hero() {
  return (
    <section className="grain relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32">
      <div className="absolute inset-0 gradient-bg" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-80 w-[42rem] -translate-x-1/2 aura-violet"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200/60 bg-white/60 px-3 py-1 text-xs font-medium text-brand-700 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Beta 公测中 · 2026 新版上线
          </div>

          <h1 className="text-display">
            你的 <span className="gradient-text">AI 出海团队</span>
            <br />
            从洞察到变现，一站搞定
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-600 text-cjk-relaxed">
            OneClaw 用三位专属 AI Agent —— 市场分析师、创意总监、品牌运营官，
            <br className="hidden sm:block" />
            帮跨境团队把每周 30+ 小时的重复工作压缩到 10 分钟内。
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/app/create"
              className="lift group inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-zinc-800"
            >
              免费开始体验
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#demo"
              className="lift group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:ring-zinc-300"
            >
              <Play className="h-4 w-4 fill-current" />
              观看 90 秒演示
            </a>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Beta 用户限时免费
            </div>
            <div className="hidden sm:block h-3 w-px bg-zinc-200" />
            <div className="hidden sm:block">无需信用卡 · 14 天免费试用</div>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="relative">
      <div className="glass relative rounded-2xl border border-zinc-200/80 shadow-xl overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-zinc-100 px-4 py-3 bg-zinc-50/60">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <div className="ml-4 text-xs text-zinc-500 font-mono">
            app.oneclaw.ai/workspace
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 sm:p-6">
          <PreviewCard
            icon={<TrendingUp className="h-4 w-4" />}
            agent="市场分析师"
            tone="brand"
            title="检测到 3 个高潜品类"
            sub="便携榨汁杯 · ROI 94 · 月销 12.4K"
          />
          <PreviewCard
            icon={<Video className="h-4 w-4" />}
            agent="创意总监"
            tone="violet"
            title="已生成 4 支短视频"
            sub="9:16 竖屏 · 平均时长 15s"
            highlight
          />
          <PreviewCard
            icon={<Globe className="h-4 w-4" />}
            agent="品牌运营官"
            tone="fuchsia"
            title="多平台同步发布完成"
            sub="TikTok · IG · YouTube Shorts"
          />
        </div>
      </div>
    </div>
  );
}

const tonePalette = {
  brand: {
    grad: "from-brand-500 to-brand-600",
    bar: "bg-brand-50",
    text: "text-brand-600",
  },
  violet: {
    grad: "from-violet-500 to-violet-600",
    bar: "bg-violet-50",
    text: "text-violet-600",
  },
  fuchsia: {
    grad: "from-fuchsia-500 to-fuchsia-600",
    bar: "bg-fuchsia-50",
    text: "text-fuchsia-600",
  },
} as const;

function PreviewCard({
  icon,
  agent,
  tone,
  title,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  agent: string;
  tone: keyof typeof tonePalette;
  title: string;
  sub: string;
  highlight?: boolean;
}) {
  const p = tonePalette[tone];
  return (
    <div
      className={`relative rounded-xl bg-white p-4 ${
        highlight ? "gradient-border shadow-md" : "border border-zinc-200/80"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${p.grad} text-white`}
        >
          {icon}
        </div>
        <span className="text-xs font-medium text-zinc-500">{agent}</span>
      </div>
      <div className="mt-3 text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
      <div className="mt-3 flex items-center gap-2">
        <div className={`h-1 flex-1 overflow-hidden rounded-full ${p.bar}`}>
          <div className={`h-full w-3/4 rounded-full bg-gradient-to-r ${p.grad}`} />
        </div>
        <span className={`text-2xs font-medium ${p.text}`}>已完成</span>
      </div>
    </div>
  );
}
