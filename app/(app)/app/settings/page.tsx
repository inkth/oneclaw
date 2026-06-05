import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { getWorkspaceQuota } from "@/lib/quota";
import { Crown, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = { title: "设置 · OneClaw" };

function maskPhone(p?: string | null) {
  if (!p) return "-";
  return p.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

export default async function SettingsPage() {
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  // 游客：设置页绑账号，无意义可展示，给一个清晰的登录占位
  if (!workspace || !session?.user?.id) {
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeader title="设置" description="账号、工作台与用量。" />
        <div className="rounded-xl border border-zinc-200/80 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900">
            <Crown className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-4 text-base font-semibold">登录后管理账号</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            登录后即可查看账号信息、工作台与本月用量，并管理订阅方案。
          </p>
          <div className="mt-5 flex justify-center">
            <ButtonLink href="/login?callbackUrl=/app/settings" variant="primary">
              登录 / 注册
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const [user, quota] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, email: true, name: true, createdAt: true },
    }),
    getWorkspaceQuota(workspace.id),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="设置" description="账号、工作台与用量。" />

      <section className="rounded-xl border border-zinc-200/80 bg-white">
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
              className="rounded-full bg-zinc-900 px-3 py-1 text-2xs font-semibold text-white hover:bg-zinc-800"
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
            color="brand"
          />
          <UsageBar
            label="fal 视频生成"
            used={quota.videos.used}
            limit={quota.videos.limit}
            color="violet"
          />
          <div className="text-2xs text-zinc-400">
            周期：{quota.period.start.toLocaleDateString("zh-CN")} —{" "}
            {new Date(quota.period.end.getTime() - 1).toLocaleDateString("zh-CN")}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200/80 bg-white">
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

      <section className="rounded-xl border border-zinc-200/80 bg-white">
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
  brand: { fill: "bg-brand-600", track: "bg-brand-100" },
  violet: { fill: "bg-violet-600", track: "bg-violet-100" },
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
            className={`h-full ${warn ? "bg-rose-500" : c.fill}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
