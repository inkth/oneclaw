import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "./workbench";
import { type ComposerKind } from "./agent-composer";
import { RecentVideos, type RecentVideo } from "./create/recent-videos";

export const metadata = { title: "工作台 · OneClaw" };

// 工作台是统一派活台：创作类(短视频 DIRECTOR / Listing) + 选品分析(ANALYST) + 投放复盘(REVIEW)四个 Agent 同处一框。
const AGENT_KINDS = new Set(["ANALYST", "DIRECTOR", "LISTING", "REVIEW"]);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 其他页面(如收藏「为它做视频 / 做 Listing」)带 ?agent=…&prompt=…&productId=… 接力进来。
  const sp = await searchParams;
  const initialAgent = AGENT_KINDS.has(sp.agent ?? "")
    ? (sp.agent as ComposerKind)
    : undefined;
  const initialInput = sp.prompt || undefined;
  const initialProductId = sp.productId || undefined;

  // 游客可浏览；无工作台时任务流与成片为空。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;

  let videos: RecentVideo[] = [];
  if (workspace) {
    const vs = await apiServer<{ videos: RecentVideo[] }>(
      `/workspaces/${workspace.id}/videos`,
    ).catch(() => ({ videos: [] as RecentVideo[] }));
    videos = (vs.videos ?? []).slice(0, 6);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="pt-4 text-center sm:pt-8">
        <h1 className="font-display text-display-sm text-ink">
          一句话，出一条带货内容
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500">
          {!workspace
            ? "选个 Agent —— 做视频、写 Listing、选品分析、投放复盘，写一句指令就能开干。登录后产出会存进你的资产库。"
            : "做视频、写 Listing、选品分析、投放复盘，都在这一框。短视频成片归「资产 · 作品」，分析与复盘的对话和结果都在「会话」里。"}
        </p>
      </div>

      {/* key：弹窗内登录后 refresh 重传 props，强制重挂载以重置 useState(initial*) */}
      <Workbench
        key={user?.id ?? "guest"}
        workspaceId={workspace?.id ?? ""}
        isGuest={!workspace}
        showStream={false}
        initialAgent={initialAgent}
        initialInput={initialInput}
        initialProductId={initialProductId}
        agents={["DIRECTOR", "LISTING", "ANALYST", "REVIEW"]}
        showQuickActions
        showAssetChips
      />

      <RecentVideos videos={videos} />
    </div>
  );
}
