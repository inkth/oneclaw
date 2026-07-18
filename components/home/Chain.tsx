import { BarChart3, Clapperboard, FileText, Play, TrendingUp } from "lucide-react";

/* 全链路：四个环节连成一条流水线，上一步产出 = 下一步输入。
   每张卡底部放该环节的「真实产物」微缩样张，而非抽象插图。 */

const STEPS = [
  {
    no: "01",
    agent: "选品分析",
    icon: TrendingUp,
    tone: "text-brand-600 bg-brand-50",
    title: "带 ROI 评分的选品清单",
    desc: "基于 TikTok Shop 真实销售数据，按你的品类偏好和毛利底线，筛出值得一试的商品。",
    visual: <ProductVisual />,
  },
  {
    no: "02",
    agent: "短视频创作",
    icon: Clapperboard,
    tone: "text-blue-600 bg-blue-50",
    title: "一个产品，选对角度出片",
    desc: "AI 按产品挑最合适的叙事角度，直出 9:16 成片与封面。",
    visual: <VideoVisual />,
  },
  {
    no: "03",
    agent: "Listing 内容",
    icon: FileText,
    tone: "text-sky-600 bg-sky-50",
    title: "文案主图，一次备齐",
    desc: "英文标题、卖点文案到商品主图一次产出，商品页直接能用。",
    visual: <ListingVisual />,
  },
  {
    no: "04",
    agent: "投放复盘",
    icon: BarChart3,
    tone: "text-emerald-600 bg-emerald-50",
    title: "报表上传，答案直出",
    desc: "上传 GMV Max 投流报表，ROI 四象限和加减预算建议直接给你，不用自己拉透视表。",
    visual: <ReviewVisual />,
  },
];

const PROOFS = [
  { value: "4 份连续产物", label: "围绕同一件商品生成" },
  { value: "1 条共享上下文", label: "不用重复搬运资料" },
  { value: "AI 选角度", label: "按产品匹配叙事，单条直出" },
  { value: "ROI 四象限", label: "投流报表一键复盘" },
];

export function Chain() {
  return (
    <section id="chain" className="relative bg-white/55 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-end gap-6 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <div className="section-kicker">
              01 / 全链路
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/[0.07] bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              连续案例：USB 便携榨汁杯
            </div>
          </div>
          <div>
            <h2 className="text-display-sm">从发现机会，到做出结果</h2>
            <p className="mt-4 max-w-2xl text-base text-zinc-600 cjk-relaxed">
              发现猫把选品、内容、Listing 和复盘连在一起，
              上一步的结果可以直接交给下一位 Agent 继续做。
            </p>
          </div>
        </div>

        <div className="relative mt-14">
          {/* 流水线连接光带（仅大屏） */}
          <div aria-hidden className="claw-trail absolute left-[8%] right-[8%] top-4 hidden lg:block" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.no} className="flex flex-col">
                <div className="relative z-10 flex justify-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white font-display text-xs font-semibold text-zinc-500 shadow-sm nums">
                    {s.no}
                  </span>
                </div>
                <div className="dk-card dk-lift mt-4 flex flex-1 flex-col p-6">
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
        <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-black/[0.07] bg-white/15 lg:grid-cols-4">
          {PROOFS.map((p) => (
            <div key={p.label} className="bg-ink px-6 py-6 text-center">
              <div className="font-display text-lg font-semibold text-white nums">{p.value}</div>
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
    { name: "机会评分", value: "94 / 100", w: "w-[94%]" },
    { name: "预估毛利", value: "48%", w: "w-[78%]" },
  ];
  return (
    <div className="space-y-2.5 rounded-lg border border-black/[0.05] bg-zinc-50/60 p-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-center justify-between text-2xs">
            <span className="font-medium text-zinc-700">{r.name}</span>
            <span className="font-semibold text-brand-600 nums">{r.value}</span>
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
  const tiles = ["痛点", "开箱", "榨汁", "成品"];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {tiles.map((t, i) => (
        <div
          key={t}
          className="story-frame relative flex aspect-[9/16] items-end justify-center overflow-hidden rounded-lg"
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

function ListingVisual() {
  return (
    <div className="space-y-2 rounded-lg border border-black/[0.05] bg-zinc-50/60 p-3">
      <div className="flex items-center justify-between text-2xs">
        <span className="font-medium text-zinc-700">Portable Juicer Cup, USB…</span>
        <span className="font-semibold text-sky-600">标题</span>
      </div>
      <div className="space-y-1">
        {["w-[92%]", "w-[78%]", "w-[85%]"].map((w) => (
          <div key={w} className={`h-1 ${w} rounded-full bg-sky-200/80`} />
        ))}
      </div>
      <div className="flex items-center justify-between text-2xs">
        <span className="text-zinc-500">卖点 × 5 · 主图 × 3</span>
        <span className="font-medium text-emerald-600">可上架</span>
      </div>
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
