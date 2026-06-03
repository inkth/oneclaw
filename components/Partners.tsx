const categories = [
  "3C 数码",
  "厨房小电",
  "宠物用品",
  "户外装备",
  "母婴喂养",
  "美妆护肤",
  "运动健康",
  "家居好物",
  "潮流服饰",
  "礼品玩具",
  "便携家电",
];

export function Partners() {
  return (
    <section className="relative py-20 border-y border-zinc-200/60 bg-zinc-50/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
          适配的出海品类赛道
        </p>
        <div className="mt-8 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-x-6 gap-y-4 items-center">
          {categories.map((c) => (
            <div
              key={c}
              className="text-center text-zinc-400 hover:text-zinc-700 transition-colors font-semibold tracking-tight text-sm sm:text-base"
            >
              {c}
            </div>
          ))}
        </div>

        <div className="mt-16 mx-auto max-w-4xl rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 L2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
            </div>
            <div>
              <div className="text-sm font-semibold">基于 OpenRouter + fal.ai 构建</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                自由切换 Claude / GPT / Gemini / DeepSeek，视频走 flux + kling，BYOK 可选。
              </div>
            </div>
          </div>
          <a
            href="/pricing"
            className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors"
          >
            查看定价 →
          </a>
        </div>
      </div>
    </section>
  );
}
