import { TrendingUp, Sparkles, CupSoda, ArrowUp, ArrowRight } from "lucide-react";

export function ProductDiscovery() {
  return (
    <section id="insights" className="relative py-24 bg-zinc-50/60 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              <Sparkles className="h-3 w-3" />
              市场分析师 Agent
            </div>
            <h2 className="mt-4 text-display-sm">
              一句话描述需求，
              <br />
              拿到带 ROI 评分的选品建议
            </h2>
            <p className="mt-4 text-zinc-600 leading-relaxed">
              市场分析师每天扫描 TikTok Shop、Amazon、Shopify 趋势，结合你的品类偏好和利润率底线，
              输出可直接下单的高潜爆品清单，附 ROI、月销、利润率三维评分。
            </p>
            <ul className="mt-6 space-y-2 text-sm text-zinc-700">
              {[
                "10+ 数据源融合，覆盖欧美东南亚主流市场",
                "ROI 评分 + 风险提示，避坑滞销品",
                "一键导出竞品分析报告，PDF / Notion 同步",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <ProductCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductCard() {
  return (
    <div className="relative rounded-2xl border border-zinc-200/80 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 bg-zinc-50/60">
        <div className="text-xs font-medium text-zinc-500">本周高潜爆品 · TOP 1</div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          推荐
        </span>
      </div>

      <div className="p-5">
        <div className="flex gap-4">
          <div className="relative h-24 w-24 flex-shrink-0 rounded-xl bg-gradient-to-br from-orange-100 via-amber-100 to-rose-100 flex items-center justify-center">
            <CupSoda className="h-9 w-9 text-orange-500/80" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-2xs font-medium uppercase tracking-wider text-brand-600">
              便携家电 · 厨房小电
            </div>
            <h3 className="mt-1 text-base font-semibold text-zinc-900 truncate">
              USB 充电便携榨汁杯 380ml
            </h3>
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              <span>建议售价</span>
              <span className="font-mono font-semibold text-zinc-900">$24.99</span>
              <span className="text-zinc-300">·</span>
              <span>采购</span>
              <span className="font-mono font-semibold text-zinc-900">$6.20</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Metric label="ROI 评分" value="94" suffix="/100" tone="brand" />
          <Metric label="毛利率" value="62" suffix="%" tone="violet" />
          <Metric label="月销估算" value="12.4K" suffix="件" tone="emerald" />
        </div>

        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-xs text-zinc-700 leading-relaxed">
          <span className="font-semibold text-brand-700">分析师小记：</span>
          近 14 天 TikTok 相关话题播放 +218%，欧美夏季消费季前的高增长品类，建议优先备货。
        </div>

        <div className="mt-5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-zinc-500">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span>趋势热度</span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
              <ArrowUp className="h-3 w-3" strokeWidth={2.5} />218%
            </span>
          </div>
          <a
            href="#"
            className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1.5 text-2xs font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            查看完整分析
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

const toneClasses = {
  brand: "bg-brand-50 text-brand-700",
  violet: "bg-violet-50 text-violet-700",
  emerald: "bg-emerald-50 text-emerald-700",
} as const;

function Metric({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix: string;
  tone: keyof typeof toneClasses;
}) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${toneClasses[tone]}`}>
      <div className="text-2xs font-medium opacity-70">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-0.5">
        <span className="text-lg font-bold tabular-nums">{value}</span>
        <span className="text-2xs opacity-70">{suffix}</span>
      </div>
    </div>
  );
}
