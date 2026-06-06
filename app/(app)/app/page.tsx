import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, apiServer } from "@/lib/api-client";
import { TrendingUp, Compass, ArrowRight } from "lucide-react";

export const metadata = { title: "工作台 · OneClaw" };

export default async function DashboardPage() {
  const me = await getMe();
  if (!me) redirect("/login?callbackUrl=/app");
  const { user, workspace } = me;

  let productCount = 0;
  try {
    const data = await apiServer<{ products: unknown[] }>(`/workspaces/${workspace.id}/products`);
    productCount = data.products?.length ?? 0;
  } catch {
    productCount = 0;
  }

  const isFresh = productCount === 0;
  const greeting = user.name || user.phone?.slice(-4) || user.email?.split("@")[0] || "你";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">你好，{greeting} 👋</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isFresh
            ? `欢迎来到 ${workspace.name} —— 先去「发现」挑一个 TikTok 爆品吧。`
            : `这是 ${workspace.name} 的今日概览。`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/app/assets/products"
          className="group rounded-2xl border border-zinc-200 bg-white p-5 hover:border-indigo-200 hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white">
              <TrendingUp className="h-4 w-4" />
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <div className="mt-5 text-2xl font-bold tabular-nums">{productCount}</div>
          <div className="mt-0.5 text-xs text-zinc-500">选品库存</div>
        </Link>

        <Link
          href="/app/discover/products"
          className="group rounded-2xl border border-zinc-200 bg-white p-5 hover:border-indigo-200 hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
              <Compass className="h-4 w-4" />
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-300 group-hover:text-indigo-500 transition-colors" />
          </div>
          <div className="mt-5 text-base font-semibold">去发现 TikTok 爆品</div>
          <div className="mt-0.5 text-xs text-zinc-500">看榜单、收藏、一键导入选品库</div>
        </Link>
      </div>

      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
        视频生成、Agent 工作流、店铺与计费等模块正在迁移中,敬请期待。
      </div>
    </div>
  );
}
