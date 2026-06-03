import { TrendingUp, Video, Users } from "lucide-react";

const agents = [
  {
    icon: TrendingUp,
    name: "Market Analyst",
    cn: "市场分析师",
    desc: "扫描全球趋势数据，量化筛选高潜爆品，输出可落地的选品报告。",
    use: '"帮我找下东南亚母婴类目本周新爆品，毛利 40% 以上。"',
    tone: "indigo",
  },
  {
    icon: Video,
    name: "Creative Director",
    cn: "创意总监",
    desc: "为每个产品生成 4 套差异化短视频脚本与剪辑工程，匹配平台调性。",
    use: '"这款榨汁杯生成 4 条 TikTok 风格的 15 秒短视频。"',
    tone: "violet",
  },
  {
    icon: Users,
    name: "Brand Operator",
    cn: "品牌运营官",
    desc: "多平台排期、自动回复评论与私信，把客户互动收口到统一工作台。",
    use: '"把这周 6 条视频排到三个平台，避开各自高峰期相互打架。"',
    tone: "fuchsia",
  },
] as const;

const toneMap = {
  indigo: {
    badge: "bg-indigo-50 text-indigo-700",
    icon: "from-indigo-500 to-indigo-600",
    ring: "ring-indigo-100",
    glow: "from-indigo-200/40",
  },
  violet: {
    badge: "bg-violet-50 text-violet-700",
    icon: "from-violet-500 to-violet-600",
    ring: "ring-violet-100",
    glow: "from-violet-200/40",
  },
  fuchsia: {
    badge: "bg-fuchsia-50 text-fuchsia-700",
    icon: "from-fuchsia-500 to-fuchsia-600",
    ring: "ring-fuchsia-100",
    glow: "from-fuchsia-200/40",
  },
} as const;

export function Agents() {
  return (
    <section id="agents" className="relative py-24 bg-gradient-to-b from-white via-zinc-50/40 to-white scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
            Meet the team
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            三位 AI Agent，覆盖出海全链路
          </h2>
          <p className="mt-4 text-zinc-600">
            像招了一支老练的 3 人小队 —— 只是他们 7×24 在线，且永远不会离职。
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {agents.map(({ icon: Icon, name, cn: cnName, desc, use, tone }) => {
            const t = toneMap[tone];
            return (
              <div
                key={name}
                className={`group relative rounded-2xl border border-zinc-200 bg-white p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all ring-1 ${t.ring}`}
              >
                <div
                  className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl opacity-70`}
                />

                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${t.icon} text-white shadow-sm`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="mt-5">
                  <div
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${t.badge}`}
                  >
                    Agent
                  </div>
                  <h3 className="mt-2 text-lg font-semibold">{cnName}</h3>
                  <div className="text-xs text-zinc-500 font-mono">{name}</div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-zinc-600">
                  {desc}
                </p>

                <div className="mt-5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                    场景示例
                  </div>
                  <div className="mt-1.5 text-xs text-zinc-700 leading-relaxed">
                    {use}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
