import { getMe, apiServer } from "@/lib/api-client";
import { Workbench } from "./workbench";
import { type ComposerKind } from "./agent-composer";
import { SampleVideos, type SampleVid } from "./sample-videos";

export const metadata = { title: "工作台 · 发现猫" };

// 工作台是统一派活台：跨境顾问（ADVISOR） + 创作类（短视频 DIRECTOR / Listing，可按附件自动附加上身图） + 选品分析（ANALYST） + 投放复盘（REVIEW）同处一框。
const AGENT_KINDS = new Set(["ADVISOR", "ANALYST", "DIRECTOR", "LISTING", "REVIEW"]);

// 「爆款短视频示例」临时取数：EchoTik 带货视频榜（公共端点，游客可见）。
type VideoRow = {
  videoId: string;
  region: string;
  coverUrl: string | null;
  desc: string;
  totalViewsCnt: number;
  videoUrl?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // 其他页面（如收藏「为它做视频 / 做 Listing」）带 ?agent=…&prompt=…&productId=… 接力进来。
  const sp = await searchParams;
  const initialAgent = AGENT_KINDS.has(sp.agent ?? "") ? (sp.agent as ComposerKind) : undefined;
  const initialInput = sp.prompt || undefined;
  const initialProductId = sp.productId || undefined;
  const initialMaterialId = sp.materialId || undefined;

  // 游客可浏览；成片仅登录后有。
  const me = await getMe();
  const user = me?.user ?? null;
  const workspace = me?.workspace ?? null;

  // 爆款短视频示例：临时用真实 EchoTik 带货视频榜填充（公共端点，游客可见）。
  // 注：这是别人的 TikTok 成片（封面 + 点开进详情），非本平台产出；自制样片就绪后替换。
  const sampleVideos = await apiServer<{ rows: VideoRow[] }>(
    // field=2=带货榜，与视频榜页/预热键一致（field=1 播放榜的顺序表已不再被 job 刷新）。
    `/discover/video-ranklist?region=US&rank_type=1&field=2&page_size=8`,
  )
    .then((d): SampleVid[] =>
      (d.rows ?? []).slice(0, 6).map((r) => ({
        videoId: r.videoId,
        region: r.region,
        coverUrl: r.coverUrl,
        desc: r.desc,
        views: r.totalViewsCnt,
        videoUrl: r.videoUrl ?? "",
      })),
    )
    .catch((): SampleVid[] => []);

  return (
    <div className="relative isolate mx-auto max-w-5xl space-y-7 sm:space-y-9">
      <div aria-hidden className="workspace-aurora pointer-events-none absolute -inset-x-16 -top-8 -z-10 h-[31rem]" />

      <div className="pt-5 text-center sm:pt-10">
        <h1 className="font-display text-[clamp(2rem,3.8vw,3.05rem)] font-semibold leading-[1.14] tracking-[-0.022em] text-ink">
          把机会，推进到结果。
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--dk-content-secondary)]">
          选一个 Agent，说清目标就能开始。
        </p>
      </div>

      {/* key：弹窗内登录后 refresh 重传 props，强制重挂载以重置 useState(initial*)。
          接力参数也进 key —— 从 /app 自身 push 回 /app?agent=…&prompt=… 是软导航，
          key 不变则组件不重挂载，预填指令会被已有 state 吞掉。 */}
      <Workbench
        key={[user?.id ?? "guest", initialAgent, initialInput, initialProductId, initialMaterialId].join("|")}
        workspaceId={workspace?.id ?? ""}
        isGuest={!workspace}
        showStream={false}
        initialAgent={initialAgent}
        initialInput={initialInput}
        initialProductId={initialProductId}
        initialMaterialId={initialMaterialId}
        agents={["ADVISOR", "ANALYST", "DIRECTOR", "LISTING", "REVIEW"]}
        showQuickActions
        showAssetChips
      />

      <SampleVideos videos={sampleVideos} />
    </div>
  );
}
