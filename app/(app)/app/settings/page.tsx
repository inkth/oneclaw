import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getWorkspaceQuota } from "@/lib/quota";
import { Crown, Zap } from "lucide-react";

export const metadata = { title: "设置 · OneClaw" };

function maskPhone(p?: string | null) {
  if (!p) return "-";
  return p.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const [user, quota] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, email: true, name: true, createdAt: true },
    }),
    getWorkspaceQuota(workspace.id),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="mt-1 text-sm text-zinc-500">账号、工作台与用量。</p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            {quota.plan === "FREE" ? (
              <Zap className="h-4 w-4 text-zinc-500" />
            ) : (
              <Crown className="h-4 w-4 text-amber-500" />
            )}
            <h2 className="text-sm font-semibold">本月用量 · {quota.plan}</h2>
          </div>
          {quota.plan === "FREE" && (
            <Link
              href="/pricing"
              className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90"
            >
              升级 →
            </Link>
          )}
        </div>
        <div className="p-5 space-y-4">
          <UsageBar
            label="Agent 任务"
            used={quota.tasks.used}
            limit={quota.tasks.limit}
            color="indigo"
          />
          <UsageBar
            label="fal 视频生成"
            used={quota.videos.used}
            limit={quota.videos.limit}
            color="violet"
          />
          <div className="text-[11px] text-zinc-400">
            周期：{quota.period.start.toLocaleDateString("zh-CN")} —{" "}
            {new Date(quota.period.end.getTime() - 1).toLocaleDateString("zh-CN")}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white">
        <div className="px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold">账号</h2>
        </div>
        <dl className="divide-y divide-zinc-100 text-sm">
          <Row label="手机号" value={maskPhone(user?.phone)} />
          <Row label="昵称" value={user?.name ?? "-"} />
          {user?.email && <Row label="邮箱（旧）" value={user.email} />}
          <Row
            label="注册时间"
            value={user?.createdAt ? new Date(user.createdAt).toLocaleString("zh-CN") : "-"}
          />
        </dl>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white">
        <div className="px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold">工作台</h2>
        </div>
        <dl className="divide-y divide-zinc-100 text-sm">
          <Row label="名称" value={workspace.name} />
          <Row label="Slug" value={workspace.slug} />
          <Row label="方案" value={workspace.plan} />
          <Row
            label="创建时间"
            value={new Date(workspace.createdAt).toLocaleString("zh-CN")}
          />
        </dl>
      </section>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
        >
          退出当前账号
        </button>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 px-5 py-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="col-span-2 font-medium tabular-nums break-all">{value}</dd>
    </div>
  );
}

const colorMap = {
  indigo: { fill: "bg-gradient-to-r from-indigo-500 to-indigo-600", track: "bg-indigo-100" },
  violet: { fill: "bg-gradient-to-r from-violet-500 to-violet-600", track: "bg-violet-100" },
} as const;

function UsageBar({
  label,
  used,
  limit,
  color,
}: {
  label: string;
  used: number;
  limit: number | null;
  color: keyof typeof colorMap;
}) {
  const c = colorMap[color];
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const warn = !unlimited && pct >= 80;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs tabular-nums">
          <span className={warn ? "text-rose-600 font-semibold" : "text-zinc-900"}>
            {used.toLocaleString()}
          </span>
          <span className="text-zinc-400">
            {" / "}
            {unlimited ? "∞" : limit.toLocaleString()}
          </span>
        </div>
      </div>
      <div className={`mt-2 h-2 rounded-full overflow-hidden ${c.track}`}>
        {!unlimited && (
          <div
            className={`h-full ${warn ? "bg-gradient-to-r from-rose-500 to-orange-500" : c.fill}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
