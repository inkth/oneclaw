import { Layers, FlameKindling, ShuffleIcon } from "lucide-react";

const points = [
  {
    icon: Layers,
    title: "工具过载",
    desc: "选品、剪辑、投放、客户管理散落在十几个 SaaS 之间，账号成本和切换成本同时拉满。",
    tag: "工具",
  },
  {
    icon: FlameKindling,
    title: "内容枯竭",
    desc: "每天都要追新热点、产出多个版本素材，团队两三个人也很难持续高质量地喂饱平台算法。",
    tag: "创意",
  },
  {
    icon: ShuffleIcon,
    title: "平台混乱",
    desc: "TikTok、Instagram、YouTube Shorts 各有各的节奏，多平台运营对账、复盘、调优全靠手动。",
    tag: "运营",
  },
];

export function PainPoints() {
  return (
    <section className="relative py-24 bg-zinc-50/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
            为什么需要 OneClaw
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            出海团队每天都在重复打同一场仗
          </h2>
          <p className="mt-4 text-zinc-600">
            我们采访了 200+ 跨境团队，发现 90% 的精力都被消耗在这三件事上。
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {points.map(({ icon: Icon, title, desc, tag }) => (
            <div
              key={title}
              className="group relative rounded-2xl border border-zinc-200/80 bg-white p-6 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-900/5 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-700 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  {tag}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{desc}</p>
              <div className="mt-6 inline-flex items-center text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                OneClaw 的解法 →
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
