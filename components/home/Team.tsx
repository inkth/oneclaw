import { BarChart3, Clapperboard, LayoutList, TrendingUp } from "lucide-react";

/* AI 团队：四张「同事名片」，命名与工作台 Agent 标签一致。
   Design Language §4：Agent 身份统一为「灰底 + 品牌紫点缀」，不再四色渐变头像并置。 */

const MEMBERS = [
  {
    name: "选品分析",
    icon: TrendingUp,
    role: "盯趋势、算毛利，替你避开滞销品。",
    quote: "东南亚母婴本周新爆品，毛利 40% 以上的有哪些？",
    skills: ["趋势扫描", "ROI 评分", "竞品报告"],
  },
  {
    name: "短视频创作",
    icon: Clapperboard,
    role: "为每个产品挑最对路的叙事角度，单条直出可发布成片。",
    quote: "给榜首产品来一条 TikTok 短视频，叙事角度你帮我定。",
    skills: ["脚本生成", "9:16 成片", "封面直出"],
  },
  {
    name: "Listing 内容",
    icon: LayoutList,
    role: "标题、五点卖点、图文详情到商品主图，一次产出可直接上架。",
    quote: "给这款便携榨汁杯写一套英文 Listing，标题带核心关键词。",
    skills: ["英文标题", "五点卖点", "商品主图"],
  },
  {
    name: "投放复盘",
    icon: BarChart3,
    role: "读投流报表、算 ROI，告诉你该给谁加预算、关停谁。",
    quote: "分析我店铺上周的投流报表，哪些素材值得加预算？",
    skills: ["报表解析", "ROI 象限", "预算建议"],
  },
];

export function Team() {
  return (
    <section id="team" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            AI 团队
          </div>
          <h2 className="text-display-sm mt-3">四位全职 Agent，7×24 在线</h2>
          <p className="mt-4 text-base text-zinc-600 text-cjk-relaxed">
            像招了四位老练的同事——不休假、不离职，一句话就能派活。
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MEMBERS.map((m) => (
            <div key={m.name} className="dk-card dk-lift flex flex-col p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/[0.04] text-accent-pop">
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
