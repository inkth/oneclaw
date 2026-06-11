import { Clapperboard, Globe, TrendingUp } from "lucide-react";

/* AI 团队：三张「同事名片」。
   渐变头像 + 职责 + 一条你真的会说的指令，让 Agent 显得像人而非功能列表。 */

const MEMBERS = [
  {
    name: "市场分析师",
    icon: TrendingUp,
    grad: "from-brand-500 to-brand-600",
    role: "盯趋势、算毛利，替你避开滞销品。",
    quote: "东南亚母婴本周新爆品，毛利 40% 以上的有哪些？",
    skills: ["趋势扫描", "ROI 评分", "竞品报告"],
  },
  {
    name: "创意总监",
    icon: Clapperboard,
    grad: "from-violet-500 to-violet-600",
    role: "为每个产品挑最对路的叙事角度，差异化素材喂饱算法。",
    quote: "给榜首产品来一条 TikTok 短视频，叙事角度你帮我定。",
    skills: ["脚本生成", "9:16 成片", "封面直出"],
  },
  {
    name: "品牌运营官",
    icon: Globe,
    grad: "from-fuchsia-500 to-fuchsia-600",
    role: "管排期、管发布、管复盘，多平台一个人搞定。",
    quote: "把本周视频排到 TikTok、IG、Shorts 三个平台。",
    skills: ["多平台排期", "自动适配", "投放复盘"],
  },
];

export function Team() {
  return (
    <section id="team" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            Meet the team
          </div>
          <h2 className="text-display-sm mt-3">三位全职 Agent，7×24 在线</h2>
          <p className="mt-4 text-base text-zinc-600 text-cjk-relaxed">
            像招了一支老练的三人小队——只是他们不休假、不离职，也不用发工资。
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
          {MEMBERS.map((m) => (
            <div key={m.name} className="dk-card lift flex flex-col p-6">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${m.grad} text-white shadow-md`}
              >
                <m.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display mt-4 text-base font-semibold text-ink">{m.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{m.role}</p>

              <blockquote className="mt-4 border-l-2 border-zinc-200 pl-3 text-xs leading-relaxed text-zinc-500">
                「{m.quote}」
              </blockquote>

              <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                {m.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-black/[0.07] bg-zinc-50 px-2.5 py-1 text-2xs font-medium text-zinc-600"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
