import { BarChart3, Clapperboard, Play, TrendingUp } from "lucide-react";

/* 全链路：三个环节连成一条流水线，上一步产出 = 下一步输入。
   每张卡底部放该环节的「真实产物」微缩样张，而非抽象插图。 */

const STEPS = [
  {
    no: "01",
    agent: "选品分析",
    icon: TrendingUp,
    tone: "text-brand-600 bg-brand-50",
    title: "带 ROI 评分的选品清单",
    desc: "扫描 TikTok Shop 与电商趋势，按你的品类偏好和毛利底线，给出可直接下单的清单。",
    visual: <ProductVisual />,
  },
  {
    no: "02",
    agent: "短视频创作",
    icon: Clapperboard,
    tone: "text-violet-600 bg-violet-50",
    title: "一个产品，选对角度出片",
    desc: "AI 从开箱、测评、场景、对比四种叙事中挑最适合产品的，直出 9:16 成片与封面。",
    visual: <VideoVisual />,
  },
  {
    no: "03",
    agent: "投放复盘",
    icon: BarChart3,
    tone: "text-emerald-600 bg-emerald-50",
    title: "报表上传，答案直出",
    desc: "上传 GMVMax 投流报表，ROI 四象限和加减预算建议直接给你，不用自己拉透视表。",
    visual: <ReviewVisual />,
  },
];

const PROOFS = [
  { value: "30+ 小时 → 10 分钟", label: "每周重复工作" },
  { value: "1 个人", label: "跑通完整链路" },
  { value: "4 种叙事角度", label: "AI 按产品自动匹配" },
  { value: "ROI 四象限", label: "投流报表一键复盘" },
];

export function Chain() {
  return (
    <section id="chain" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            全链路
          </div>
          <h2 className="text-display-sm mt-3">一条链路，跑完一单生意</h2>
          <p className="mt-4 text-base text-zinc-600 text-cjk-relaxed">
            别再于十几个工具之间搬运数据。发现猫 把出海的三个关键环节连成一条流水线，
            上一步的产出自动成为下一步的输入。
          </p>
        </div>

        <div className="relative mt-14">
          {/* 流水线连接光带（仅大屏） */}
          <div
            aria-hidden
            className="absolute left-[12%] right-[12%] top-4 hidden h-px bg-brand-200 lg:block"
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.no} className="flex flex-col">
                <div className="relative z-10 flex justify-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white font-display text-xs font-semibold text-zinc-500 shadow-sm nums">
                    {s.no}
                  </span>
                </div>
                <div className="dk-card dk-lift mt-4 flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.tone}`}>
                      <s.icon className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-medium text-zinc-500">{s.agent}</span>
                  </div>
                  <h3 className="font-display mt-3 text-base font-semibold text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">{s.desc}</p>
                  <div className="mt-auto pt-5">{s.visual}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 数字证明带 */}
        <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-black/[0.07] bg-black/[0.06] lg:grid-cols-4">
          {PROOFS.map((p) => (
            <div key={p.label} className="bg-white px-6 py-5 text-center">
              <div className="font-display text-lg font-semibold text-ink nums">{p.value}</div>
              <div className="mt-1 text-xs text-zinc-500">{p.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 微缩产物样张 ---------- */

function ProductVisual() {
  const rows = [
    { name: "USB 便携榨汁杯", roi: 94, w: "w-[94%]" },
    { name: "宠物智能饮水机", roi: 88, w: "w-[88%]" },
  ];
  return (
    <div className="space-y-2.5 rounded-lg border border-black/[0.05] bg-zinc-50/60 p-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-center justify-between text-2xs">
            <span className="font-medium text-zinc-700">{r.name}</span>
            <span className="font-semibold text-brand-600 nums">ROI {r.roi}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-brand-100">
            <div className={`h-full ${r.w} rounded-full bg-brand-500`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function VideoVisual() {
  const tiles = ["开箱", "测评", "场景", "对比"];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {tiles.map((t, i) => (
        <div
          key={t}
          className="skeleton-media relative flex aspect-[9/16] items-end justify-center overflow-hidden rounded-lg"
        >
          {i === 0 && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-sm">
                <Play className="h-2.5 w-2.5 fill-current" />
              </span>
            </span>
          )}
          <span className="relative z-10 pb-1 text-2xs font-medium text-zinc-600">{t}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewVisual() {
  return (
    <div className="rounded-lg border border-black/[0.05] bg-zinc-50/60 p-3">
      <div className="grid grid-cols-2 gap-1">
        {[
          ["bg-emerald-100", "bg-emerald-500", "加预算"],
          ["bg-zinc-100", "bg-zinc-400", "观察"],
          ["bg-amber-100", "bg-amber-500", "降出价"],
          ["bg-rose-100", "bg-rose-400", "关停"],
        ].map(([bg, dot, label]) => (
          <div key={label} className={`flex items-center gap-1.5 rounded-md ${bg} px-2 py-1.5`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            <span className="text-2xs font-medium text-zinc-700">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-center text-2xs text-zinc-500">
        Top 素材 · 建议加预算 <span className="font-semibold text-emerald-600 nums">+30%</span>
      </div>
    </div>
  );
}
