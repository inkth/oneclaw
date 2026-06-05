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
      </div>
    </section>
  );
}
