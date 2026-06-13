import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "../workbench";
import { type ComposerKind } from "../agent-composer";
import { type StreamTask } from "../task-stream";
import { RecentVideos, type RecentVideo } from "./recent-videos";

export const metadata = { title: "创作 · OneClaw" };

// 创作页只挂创作类 Agent:短视频(DIRECTOR)与 Listing(LISTING)。
const CREATE_KINDS = new Set(["DIRECTOR", "LISTING"]);

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 选品库「为它做视频 / 做 Listing」带 ?agent=…&prompt=…&productId=… 接力进来。
  const sp = await searchParams;
  const initialAgent = CREATE_KINDS.has(sp.agent ?? "")
    ? (sp.agent as ComposerKind)
    : undefined;
  const initialInput = sp.prompt || undefined;
  const initialProductId = sp.productId || undefined;

  // 游客可浏览;无工作台时任务流为空。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;

  let tasks: StreamTask[] = [];
  let videos: RecentVideo[] = [];
  if (workspace) {
    const [ts, vs] = await Promise.all([
      apiServer<{ tasks: StreamTask[] }>(`/workspaces/${workspace.id}/agent-tasks`).catch(
        () => ({ tasks: [] as StreamTask[] }),
      ),
      apiServer<{ videos: RecentVideo[] }>(`/workspaces/${workspace.id}/videos`).catch(
        () => ({ videos: [] as RecentVideo[] }),
      ),
    ]);
    tasks = ts.tasks ?? [];
    videos = (vs.videos ?? []).slice(0, 6);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="pt-4 text-center sm:pt-8">
        <h1 className="font-display text-display-sm text-ink">
          一句话,出一条带货内容
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500">
          {!workspace
            ? "选短视频或 Listing,写一句指令就能出片 —— 登录后产出会存进你的资产库。"
            : "短视频成片归到「资产 · 短视频」,Listing 文案出在任务卡里,可直接复制。"}
        </p>
      </div>

      {/* key:弹窗内登录后 refresh 重传 props,强制重挂载以重置 useState(initial*) */}
      <Workbench
        key={user?.id ?? "guest"}
        workspaceId={workspace?.id ?? ""}
        isGuest={!workspace}
        initialTasks={tasks}
        streamLimit={8}
        initialAgent={initialAgent}
        initialInput={initialInput}
        initialProductId={initialProductId}
        agents={["DIRECTOR", "LISTING"]}
        streamAgents={["DIRECTOR", "LISTING"]}
        showQuickActions
        showAssetChips
      />

      <RecentVideos videos={videos} />
    </div>
  );
}
