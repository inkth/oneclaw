import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "./workbench";
import { type ComposerKind } from "./agent-composer";
import { type StreamTask } from "./task-stream";

export const metadata = { title: "工作台 · OneClaw" };

const COMPOSER_KINDS = new Set(["ANALYST", "DIRECTOR", "LISTING", "REVIEW"]);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 其他页面可带 ?agent=DIRECTOR&prompt=…&productId=… 接力进工作台(如选品库「为它做视频」)。
  const sp = await searchParams;
  const initialAgent = COMPOSER_KINDS.has(sp.agent ?? "")
    ? (sp.agent as ComposerKind)
    : undefined;
  const initialInput = sp.prompt || undefined;
  const initialProductId = sp.productId || undefined;

  // 游客可浏览;无工作台时各项为空。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;

  let productCount = 0;
  let videoCount = 0;
  let tasks: StreamTask[] = [];
  if (workspace) {
    const [prod, vids, ts] = await Promise.all([
      apiServer<{ products: unknown[] }>(`/workspaces/${workspace.id}/products`).catch(() => ({ products: [] })),
      apiServer<{ videos: unknown[] }>(`/workspaces/${workspace.id}/videos`).catch(() => ({ videos: [] })),
      apiServer<{ tasks: StreamTask[] }>(`/workspaces/${workspace.id}/agent-tasks`).catch(() => ({ tasks: [] })),
    ]);
    productCount = prod.products?.length ?? 0;
    videoCount = vids.videos?.length ?? 0;
    tasks = ts.tasks ?? [];
  }

  const isFresh = productCount === 0 && videoCount === 0 && tasks.length === 0;
  const greeting =
    user?.name || user?.phone?.slice(-4) || user?.email?.split("@")[0] || "访客";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* 对标竞品:居中大标题 + 胶囊行 + 超大输入卡;任务以会话流追加在输入框下方 */}
      <div className="pt-4 text-center sm:pt-8">
        <h1 className="font-display text-display-sm text-ink">
          让每个爆品,自己卖货
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500">
          {!workspace
            ? `你好,${greeting} —— 选个 Agent 派活,或登录后拥有自己的工作台。`
            : isFresh
              ? `你好,${greeting} —— 欢迎来到 ${workspace.name},派个活跑通你的第一条出海链路。`
              : `你好,${greeting} —— 接着派活,结果会出现在输入框下方。`}
        </p>
      </div>

      {/* key：弹窗内登录后 refresh 重传 props，强制重挂载以重置 useState(initial*) */}
      <Workbench
        key={user?.id ?? "guest"}
        workspaceId={workspace?.id ?? ""}
        isGuest={!workspace}
        showPresets={!!workspace && isFresh}
        initialTasks={tasks}
        streamLimit={8}
        initialAgent={initialAgent}
        initialInput={initialInput}
        initialProductId={initialProductId}
      />
    </div>
  );
}
