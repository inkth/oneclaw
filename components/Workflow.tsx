import { Clock, Zap, Check, X } from "lucide-react";

const beforeSteps = [
  "手动浏览各大榜单、TikTok Creative Center 选品",
  "Excel 整理竞品、ROI、利润率数据",
  "团队脑暴文案、找剪辑、改 3-4 版本",
  "各平台单独登录、单独排期、单独复盘",
  "客户私信、评论靠人肉客服回复",
];

const afterSteps = [
  "Market Analyst 自动扫榜并打分推荐",
  "Creative Director 一键生成 4 套差异化素材",
  "Brand Operator 多平台排期 + 数据回流",
  "客户互动统一收口到 OneClaw 工作台",
];

export function Workflow() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            把每周 <span className="gradient-text">30+ 小时</span> 压缩到{" "}
            <span className="gradient-text">10 分钟</span>
          </h2>
          <p className="mt-4 text-zinc-600">
            同样一个选品 → 内容 → 发布 → 回收的循环，OneClaw 让单人即可跑通完整链路。
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
                  <Clock className="h-4 w-4 text-zinc-600" />
                </div>
                <h3 className="text-base font-semibold text-zinc-900">
                  没有 OneClaw 之前
                </h3>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                30+ 小时 / 周
              </span>
            </div>
            <ul className="mt-6 space-y-3">
              {beforeSteps.map((s) => (
                <li key={s} className="flex items-start gap-3 text-sm">
                  <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
                  <span className="text-zinc-600 line-through decoration-zinc-300">
                    {s}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative rounded-2xl border border-indigo-200 bg-white p-6 sm:p-8 shadow-sm">
            <div className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider text-white shadow-sm">
              <Zap className="h-3 w-3" />
              推荐
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <Zap className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold text-zinc-900">
                  使用 OneClaw 之后
                </h3>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                10 分钟 / 周
              </span>
            </div>
            <ul className="mt-6 space-y-3">
              {afterSteps.map((s, i) => (
                <li key={s} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="text-zinc-700">{s}</span>
                  {i === 1 && (
                    <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-2xs font-medium text-violet-700">
                      省 8h
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between rounded-xl bg-zinc-50/60 border border-zinc-200/80 p-3">
              <div className="text-xs text-zinc-500">本周节省时间</div>
              <div className="text-lg font-bold gradient-text">28.5 小时</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
