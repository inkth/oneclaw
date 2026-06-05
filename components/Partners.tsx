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
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {categories.map((c) => (
            <span
              key={c}
              className="rounded-full ring-edge surface-sheen px-3.5 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:border-brand-200 hover:text-brand-700"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
