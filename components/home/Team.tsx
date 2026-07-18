import { BarChart3, Check, Clapperboard, LayoutList, TrendingUp } from "lucide-react";

const MEMBERS = [
  {
    name: "选品分析",
    icon: TrendingUp,
    task: "先判断值不值得做",
    output: "机会分 94 · 预估毛利 48%",
  },
  {
    name: "短视频创作",
    icon: Clapperboard,
    task: "从商品信息里挑叙事角度",
    output: "15s UGC 脚本 · 9:16 分镜",
  },
  {
    name: "Listing 内容",
    icon: LayoutList,
    task: "把卖点变成可上架内容",
    output: "英文标题 · 五点卖点 · 商品主图",
  },
  {
    name: "投放复盘",
    icon: BarChart3,
    task: "根据结果决定下一步预算",
    output: "素材 A 建议加预算 30%",
  },
];

export function Team() {
  return (
    <section id="team" className="relative overflow-hidden bg-ink py-20 text-white sm:py-28">
      <div aria-hidden className="absolute -right-40 top-0 h-96 w-96 rounded-full bg-brand-500/20 blur-[120px]" />
      <div aria-hidden className="absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-brand-800/25 blur-[110px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-end gap-6 lg:grid-cols-[.72fr_1.28fr]">
          <div className="section-kicker section-kicker-dark">
            02 / Agent 接力
          </div>
          <div>
            <h2 className="text-display-sm text-white">不是四个工具，是一支共享上下文的团队</h2>
            <p className="mt-4 max-w-2xl text-base text-zinc-400 cjk-relaxed">
              每位 Agent 都接着上一位的产物继续工作。你只说一次目标，整条链路围绕同一件商品向前推进。
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[.86fr_1.14fr] lg:gap-12">
          <ol className="relative space-y-3" aria-label="四位 Agent 的接力顺序">
            <div aria-hidden className="agent-handoff-line absolute bottom-8 left-[23px] top-8 w-px" />
            {MEMBERS.map((member, index) => (
              <li
                key={member.name}
                className="relative grid grid-cols-[48px_1fr] gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3.5 backdrop-blur-sm"
              >
                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-lg">
                  <member.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 py-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-sm font-semibold text-white">{member.name}</h3>
                    <span className="nums text-2xs text-zinc-600">0{index + 1}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{member.task}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-200">
                    <Check className="h-3.5 w-3.5 text-brand-300" />
                    {member.output}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="relative">
            <div aria-hidden className="claw-stamp absolute -right-4 -top-7 text-brand-400/30" />
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#f8f7f2] text-ink shadow-2xl">
              <div className="flex items-center justify-between border-b border-black/[0.07] px-5 py-4 sm:px-6">
                <div>
                  <div className="text-2xs font-bold uppercase tracking-[0.16em] text-brand-600">完整交付包</div>
                  <div className="font-display mt-1 text-lg font-semibold">USB 便携榨汁杯 · 北美市场</div>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1.5 text-2xs font-semibold text-brand-700">
                  4 / 4 已完成
                </span>
              </div>

              <div className="grid gap-px bg-black/[0.06] sm:grid-cols-2">
                <div className="bg-white p-5 sm:p-6">
                  <div className="text-xs font-semibold text-zinc-500">机会判断</div>
                  <div className="mt-4 flex items-end justify-between">
                    <div className="font-display nums text-4xl font-semibold tracking-tight text-ink">94</div>
                    <div className="text-right text-2xs leading-relaxed text-zinc-500">
                      机会评分<br /><span className="font-semibold text-brand-600">建议进入测试</span>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-brand-100">
                    <div className="h-full w-[94%] rounded-full bg-brand-500" />
                  </div>
                </div>

                <div className="bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-500">15s UGC 分镜</div>
                    <span className="text-2xs text-brand-600">9:16</span>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {["痛点", "开箱", "榨汁", "成品"].map((frame) => (
                      <div key={frame} className="story-frame flex aspect-[9/14] items-end justify-center rounded-lg pb-1.5 text-[9px] font-semibold text-zinc-600">
                        <span>{frame}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-5 sm:p-6">
                  <div className="text-xs font-semibold text-zinc-500">Listing 标题</div>
                  <p className="mt-4 text-sm font-semibold leading-relaxed text-ink">
                    Portable USB Blender, 6 Blades, Travel Ready
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
                    {["BPA-free", "USB-C", "Easy clean"].map((tag) => (
                      <span key={tag} className="rounded-full bg-zinc-100 px-2 py-1">{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-5 sm:p-6">
                  <div className="text-xs font-semibold text-zinc-500">预算动作</div>
                  <div className="mt-4 rounded-xl bg-brand-50 p-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-brand-800">
                      <span>素材 A · UGC 开箱</span>
                      <span className="nums">+30%</span>
                    </div>
                    <div className="mt-2 text-2xs text-brand-700">ROI 高于目标线，建议逐日放量</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
