// 选品板块统一加载态：点击侧边栏「选品」或切换 商品/店铺/达人/视频 Tab 时，
// 立即显示骨架屏，服务端数据（榜单 + 类目 + 导入/分析/收藏交集）流式补上，
// 避免「点了没反应」的卡顿感。覆盖 /app/discover 下所有未自带 loading 的子路由。
const bar = "rounded skeleton";

export default function DiscoverLoading() {
  return (
    <div>
      {/* PageHeader 骨架 */}
      <div className="mb-6 space-y-2">
        <div className={bar + " h-7 w-40"} />
        <div className={bar + " h-4 w-64"} />
      </div>

      {/* FilterBar 骨架（地区 / 类目 / 排序 pill 行） */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={bar + " h-8 w-20"} />
        ))}
      </div>

      {/* 列表骨架 */}
      <div className="rounded-2xl bg-white overflow-hidden">
        <div className={"h-10 " + bar + " rounded-none"} />
        <div className="divide-y divide-[var(--dk-stroke-divider)]">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className={bar + " h-12 w-12 shrink-0 rounded-lg"} />
              <div className="flex-1 space-y-2">
                <div className={bar + " h-4 w-2/3"} />
                <div className={bar + " h-3 w-1/3"} />
              </div>
              <div className={bar + " h-4 w-16"} />
              <div className={bar + " h-4 w-16"} />
              <div className={bar + " h-8 w-20 rounded-lg"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
