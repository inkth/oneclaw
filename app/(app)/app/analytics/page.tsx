import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
        <BarChart3 className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold">复盘</h1>
      <p className="mt-2 text-sm text-zinc-500">
        销售、流量与内容表现看板正在打磨中，帮你复盘每一条视频的转化，敬请期待。
      </p>
      <span className="mt-4 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">
        即将上线
      </span>
    </div>
  );
}
