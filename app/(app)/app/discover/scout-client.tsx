"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  Clapperboard,
  ExternalLink,
  Loader2,
  MessageCircleQuestion,
  Radar,
  RefreshCw,
  X,
} from "lucide-react";

import { apiBrowser } from "@/lib/api-browser";
import { CREDIT_COST } from "@/lib/credits";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { Badge } from "@/components/ui/Badge";
import { BrandMark } from "@/components/ui/BrandMark";
import { Card } from "@/components/ui/Card";
import {
  ComposerForm,
  ComposerSendButton,
  ComposerTextarea,
  ComposerToolbar,
} from "@/components/ui/Composer";
import { CreditCost } from "@/components/ui/CreditCost";
import { EmptyState } from "@/components/ui/EmptyState";
import { Markdown } from "@/components/ui/Markdown";
import type { Tone } from "@/lib/ui/tokens";

import { REGIONS, type Region } from "./_components/regions";
import type { CategoryOption } from "./_components/FilterBar";
import { useDiscoverFilterMemory } from "./_components/filter-memory";
import { fmt, fmtMoney } from "./_components/format";
import { Thumb } from "./_components/shared";

// ── 类型(镜像 Go DailyReportView / AgentTask) ───────────────────────────────

type ReportProduct = {
  productId: string;
  name: string;
  nameZh: string;
  region: string;
  avgPriceCents: number;
  commissionRate: number;
  totalSaleCnt: number;
  sale7dCnt: number;
  gmv7dCents: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  coverUrls: string[];
  importedProductId: string | null;
};

type Opportunity = {
  externalId: string;
  headline: string;
  reason: string;
  action: string;
  tag: string;
};

export type DailyReport = {
  status: "DONE" | "GENERATING" | "FAILED" | "EMPTY";
  dt: string;
  region: string;
  categoryId: string;
  generating: boolean;
  updatedAt?: string | null;
  summary: string;
  sections?: {
    opportunities: Opportunity[];
    watchouts?: string[] | null;
    videoInsight?: string;
  } | null;
  products?: Record<string, ReportProduct> | null;
};

type ScoutTask = {
  id: string;
  agent: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  input: string;
  output?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

const TAG_TONE: Record<string, Tone> = {
  热卖: "warning",
  黑马: "violet",
  高佣: "success",
  蓝海: "info",
};

const SUGGESTED_QUESTIONS = [
  "今天最值得先测的一个品是哪个?为什么",
  "预算 5000 元以内,从这些机会里怎么起步",
  "帮我对比机会清单里竞争度最低的两个品",
];

const convStorageKey = (wsId: string) => `faxianmao:scout-conv:${wsId}`;

// ── 页面 ─────────────────────────────────────────────────────────────────────

export function ScoutClient({
  isGuest,
  workspaceId,
  region,
  categoryId,
  categories,
  initialReport,
}: {
  isGuest: boolean;
  workspaceId: string;
  region: Region;
  categoryId: string | null;
  categories: CategoryOption[];
  initialReport: DailyReport | null;
}) {
  const router = useRouter();
  // 与四个榜单页共用同一份「地区+类目」记忆:在选品官订阅的市场,切到榜单页仍是同一市场。
  useDiscoverFilterMemory(
    "/app/discover",
    region,
    { categoryId, categoryL2Id: null, categoryL3Id: null },
    true,
  );

  // 服务端重取(切区域/类目)后重置本地报告态:渲染期对齐 props,不走 effect(避免级联渲染)。
  const [report, setReport] = useState<DailyReport | null>(initialReport);
  const [prevInitial, setPrevInitial] = useState(initialReport);
  if (initialReport !== prevInitial) {
    setPrevInitial(initialReport);
    setReport(initialReport);
  }

  // 报告生成中:轮询直到就绪(共享报告通常十几秒;组件卸载即停)。
  const generating = !!report && (report.generating || report.status === "GENERATING");
  useEffect(() => {
    if (!generating) return;
    const query = `region=${region}${categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : ""}`;
    const path = isGuest
      ? `/discover/report?${query}`
      : `/workspaces/${workspaceId}/discover/report?${query}`;
    const timer = setInterval(() => {
      apiBrowser<DailyReport>(path)
        .then((r) => setReport(r))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [generating, region, categoryId, isGuest, workspaceId]);

  const navigate = useCallback(
    (nextRegion: string, nextCategory: string | null) => {
      const p = new URLSearchParams();
      p.set("region", nextRegion);
      if (nextCategory) p.set("category_id", nextCategory);
      router.push(`/app/discover?${p.toString()}`);
    },
    [router],
  );

  const catLabel = categoryId
    ? (categories.find((c) => c.id === categoryId)?.name ?? "所选类目")
    : "全类目";
  const regionMeta = REGIONS.find((r) => r.code === region);

  // 「问选品官」把商品带进对话上下文。
  const [focusProduct, setFocusProduct] = useState<{ externalId: string; name: string } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const chatAnchorRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");

  const askAbout = useCallback((p: { externalId: string; name: string }) => {
    setFocusProduct(p);
    setDraft((d) => (d.trim() ? d : `关于「${p.name}」:`));
    chatAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => composerRef.current?.focus(), 350);
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-10">
      <ScoutHero
        region={region}
        categoryId={categoryId}
        categories={categories}
        regionLabel={regionMeta ? `${regionMeta.flag} ${regionMeta.cn}` : region}
        catLabel={catLabel}
        report={report}
        generating={generating}
        onNavigate={navigate}
      />

      <ReportBody
        report={report}
        generating={generating}
        region={region}
        catLabel={catLabel}
        onAsk={askAbout}
      />

      <div ref={chatAnchorRef} className="scroll-mt-24">
        <ScoutChat
          isGuest={isGuest}
          workspaceId={workspaceId}
          region={region}
          categoryId={categoryId}
          draft={draft}
          setDraft={setDraft}
          focusProduct={focusProduct}
          clearFocus={() => setFocusProduct(null)}
          composerRef={composerRef}
          reportReady={!!report && report.status === "DONE"}
        />
      </div>
    </div>
  );
}

// ── 头部:Agent 身份 + 订阅(区域/类目) ─────────────────────────────────────

function ScoutHero({
  region,
  categoryId,
  categories,
  regionLabel,
  catLabel,
  report,
  generating,
  onNavigate,
}: {
  region: Region;
  categoryId: string | null;
  categories: CategoryOption[];
  regionLabel: string;
  catLabel: string;
  report: DailyReport | null;
  generating: boolean;
  onNavigate: (region: string, categoryId: string | null) => void;
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.65)]">
              <BrandMark className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-ink">AI 选品官</h1>
                <Badge tone="brand" icon={<Radar className="h-3 w-3" />}>
                  每日报告
                </Badge>
              </div>
              <p className="mt-0.5 text-[13px] text-[var(--dk-content-secondary)]">
                每天替你盯 {regionLabel} · {catLabel} 的 TikTok Shop 数据,给出当日选品建议,可以继续追问
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SubscribeSelect
              value={region}
              onChange={(v) => onNavigate(v, categoryId)}
              options={REGIONS.map((r) => ({ value: r.code, label: `${r.flag} ${r.cn}` }))}
            />
            <SubscribeSelect
              value={categoryId ?? ""}
              onChange={(v) => onNavigate(region, v || null)}
              options={[
                { value: "", label: "全类目" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--dk-content-tertiary)]">
          {report?.dt && <span className="tabular-nums">报告日期 {report.dt}</span>}
          {generating ? (
            <span className="inline-flex items-center gap-1.5 text-indigo-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {report?.status === "DONE"
                ? "今日新报告生成中,先看最近一期"
                : "选品官正在读取榜单撰写今日报告…"}
            </span>
          ) : report?.status === "DONE" ? (
            <span>数据来源:EchoTik 榜单(近 7 天动量口径),结论均可去榜单页核对</span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** 订阅下拉:原生 select 包一层胶囊皮,移动端可用性最好。 */
function SubscribeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative inline-flex h-9 items-center rounded-full border border-[var(--dk-stroke-border)] bg-white pl-3 pr-8 text-[13px] font-[550] text-ink transition-colors hover:bg-[var(--dk-action-regular)]">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        aria-label="切换订阅"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none">
        {options.find((o) => o.value === value)?.label ?? value}
      </span>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[var(--dk-content-tertiary)]" />
    </label>
  );
}

// ── 报告正文 ─────────────────────────────────────────────────────────────────

function ReportBody({
  report,
  generating,
  region,
  catLabel,
  onAsk,
}: {
  report: DailyReport | null;
  generating: boolean;
  region: Region;
  catLabel: string;
  onAsk: (p: { externalId: string; name: string }) => void;
}) {
  if (!report) {
    // 服务端取数失败(部署窗口/网络):给出可行动的空态,而不是无限骨架屏。
    return (
      <EmptyState
        title="报告暂时取不到"
        description="选品官的报告服务暂时不可用,请稍后刷新重试;榜单数据页不受影响,可先去商品榜看数据。"
      />
    );
  }
  if (report.status !== "DONE" && generating) {
    return <ReportSkeleton />;
  }
  if (report.status === "EMPTY" || (report.status === "FAILED" && !report.summary)) {
    return (
      <EmptyState
        title="这个市场/类目的数据还在准备中"
        description={`${catLabel} 在 ${region} 站还没有足够的榜单数据支撑一份报告。可以先切回「美国 · 全类目」看今天的报告,或到商品榜浏览一次让数据热起来。`}
      />
    );
  }

  const opps = report.sections?.opportunities ?? [];
  const products = report.products ?? {};
  const watchouts = (report.sections?.watchouts ?? []).filter(Boolean);
  const videoInsight = report.sections?.videoInsight?.trim();

  return (
    <div className="flex flex-col gap-4">
      {report.summary && (
        <Card className="border-indigo-100/80 bg-gradient-to-br from-indigo-50/60 to-white">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <BrandMark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-xs font-semibold text-indigo-600">今日总评</div>
              <Markdown className="text-sm text-ink">{report.summary}</Markdown>
            </div>
          </div>
        </Card>
      )}

      {opps.length > 0 && (
        <div>
          <div className="mb-2.5 flex items-baseline justify-between px-0.5">
            <h2 className="text-sm font-semibold text-ink">今日机会 · {opps.length} 个</h2>
            <Link
              href={`/app/discover/products?region=${region}&view=hot7d`}
              className="inline-flex items-center gap-1 text-xs font-[550] text-[var(--dk-content-secondary)] hover:text-ink"
            >
              看完整动量榜 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {opps.map((o, i) => (
              <OpportunityCard
                key={o.externalId + i}
                index={i}
                opp={o}
                product={products[o.externalId]}
                region={region}
                onAsk={onAsk}
              />
            ))}
          </div>
        </div>
      )}

      {(watchouts.length > 0 || videoInsight) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {watchouts.length > 0 && (
            <Card>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <CircleAlert className="h-3.5 w-3.5" /> 风险与提醒
              </div>
              <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-[var(--dk-content-secondary)]">
                {watchouts.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                    {w}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {videoInsight && (
            <Card>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                <Clapperboard className="h-3.5 w-3.5" /> 内容风向
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--dk-content-secondary)]">{videoInsight}</p>
              <Link
                href={`/app/discover/videos?region=${region}`}
                className="mt-2 inline-flex items-center gap-1 text-xs font-[550] text-[var(--dk-content-secondary)] hover:text-ink"
              >
                看热门带货视频 <ArrowRight className="h-3 w-3" />
              </Link>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({
  index,
  opp,
  product,
  region,
  onAsk,
}: {
  index: number;
  opp: Opportunity;
  product?: ReportProduct;
  region: Region;
  onAsk: (p: { externalId: string; name: string }) => void;
}) {
  const name = product ? product.nameZh || product.name : opp.headline;
  const detailHref = `/app/discover/products/${opp.externalId}?region=${region}`;
  return (
    <Card padded={false} className="flex flex-col">
      <div className="flex gap-3 p-4">
        <Link href={detailHref} className="shrink-0">
          <Thumb
            src={product?.coverUrls?.[0] ?? null}
            name={name}
            className="h-16 w-16 rounded-xl"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-2xs font-semibold tabular-nums text-[var(--dk-content-tertiary)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Badge tone={TAG_TONE[opp.tag] ?? "neutral"} outline={false}>
              {opp.tag || "机会"}
            </Badge>
            <span className="truncate text-xs font-semibold text-ink">{opp.headline}</span>
          </div>
          <Link
            href={detailHref}
            className="line-clamp-2 text-[13px] font-[550] leading-snug text-ink hover:underline"
          >
            {name}
          </Link>
          {product && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs tabular-nums text-[var(--dk-content-tertiary)]">
              <span>均价 {fmtMoney(product.avgPriceCents / 100)}</span>
              <span>佣金 {product.commissionRate.toFixed(1)}%</span>
              {product.sale7dCnt > 0 && <span>近7天销量 {fmt(product.sale7dCnt)}</span>}
              {product.gmv7dCents > 0 && <span>近7天 GMV {fmtMoney(product.gmv7dCents / 100)}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="px-4 pb-3 text-[13px] leading-relaxed text-[var(--dk-content-secondary)]">
        {opp.reason}
        {opp.action && (
          <span className="mt-1 block text-indigo-700/90">建议:{opp.action}</span>
        )}
      </div>
      <div className="mt-auto flex items-center gap-1 border-t border-[var(--dk-stroke-overlay)] px-2 py-1.5">
        <button
          onClick={() => onAsk({ externalId: opp.externalId, name })}
          className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-[550] text-[var(--dk-content-secondary)] transition-colors hover:bg-[var(--dk-action-regular)] hover:text-ink"
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" /> 问选品官
        </button>
        <Link
          href={detailHref}
          className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-[550] text-[var(--dk-content-secondary)] transition-colors hover:bg-[var(--dk-action-regular)] hover:text-ink"
        >
          <ExternalLink className="h-3.5 w-3.5" /> 数据详情
        </Link>
      </div>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="报告生成中">
      <Card>
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          <div className="text-sm text-[var(--dk-content-secondary)]">
            选品官正在读取今日榜单、比对近 7 天动量数据…通常需要十几秒
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="flex gap-3">
              <div className="h-16 w-16 rounded-xl bg-[var(--dk-surface-2)]" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-2/5 rounded bg-[var(--dk-surface-2)]" />
                <div className="h-3 w-4/5 rounded bg-[var(--dk-surface-2)]" />
                <div className="h-3 w-3/5 rounded bg-[var(--dk-surface-2)]" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── 追问对话 ─────────────────────────────────────────────────────────────────

function ScoutChat({
  isGuest,
  workspaceId,
  region,
  categoryId,
  draft,
  setDraft,
  focusProduct,
  clearFocus,
  composerRef,
  reportReady,
}: {
  isGuest: boolean;
  workspaceId: string;
  region: Region;
  categoryId: string | null;
  draft: string;
  setDraft: (v: string | ((d: string) => string)) => void;
  focusProduct: { externalId: string; name: string } | null;
  clearFocus: () => void;
  composerRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  reportReady: boolean;
}) {
  const { open: openAuth } = useAuthModal();
  const [tasks, setTasks] = useState<ScoutTask[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // 恢复上次的选品官对话(本地记忆;会话被删除时静默重开)。
  useEffect(() => {
    if (isGuest || !workspaceId) return;
    const saved = localStorage.getItem(convStorageKey(workspaceId));
    if (!saved) return;
    apiBrowser<{ tasks: ScoutTask[] }>(`/workspaces/${workspaceId}/conversations/${saved}/tasks`)
      .then((res) => {
        setConversationId(saved);
        setTasks([...(res.tasks ?? [])].reverse()); // 接口新→旧,聊天按时间正序
      })
      .catch(() => localStorage.removeItem(convStorageKey(workspaceId)));
  }, [isGuest, workspaceId]);

  // 在跑任务轮询:直到终态由 output 接管。
  const active = useMemo(() => tasks.find((t) => t.status === "QUEUED" || t.status === "RUNNING"), [tasks]);
  useEffect(() => {
    if (!active || !workspaceId) return;
    const timer = setInterval(() => {
      apiBrowser<{ task: ScoutTask }>(`/workspaces/${workspaceId}/agent-tasks/${active.id}`)
        .then(({ task }) => {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [active, workspaceId]);

  const send = useCallback(async () => {
    const input = draft.trim();
    if (!input || sending) return;
    if (isGuest) {
      openAuth();
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const { task } = await apiBrowser<{ task: ScoutTask & { conversationId: string } }>(
        `/workspaces/${workspaceId}/agent-tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            agent: "SCOUT",
            input,
            region,
            ...(categoryId ? { discoverCategoryId: categoryId } : {}),
            ...(conversationId ? { conversationId } : {}),
            ...(focusProduct
              ? { discoverProductId: focusProduct.externalId, discoverRegion: region }
              : {}),
          }),
        },
      );
      setTasks((prev) => [...prev, task]);
      if (task.conversationId) {
        setConversationId(task.conversationId);
        localStorage.setItem(convStorageKey(workspaceId), task.conversationId);
      }
      setDraft("");
      clearFocus();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "发送失败,请稍后再试");
    } finally {
      setSending(false);
    }
  }, [draft, sending, isGuest, openAuth, workspaceId, region, categoryId, conversationId, focusProduct, setDraft, clearFocus]);

  const showSuggestions = tasks.length === 0 && !draft.trim();

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="border-b border-[var(--dk-stroke-overlay)] px-5 py-3.5">
        <div className="text-sm font-semibold text-ink">继续追问</div>
        <p className="mt-0.5 text-xs text-[var(--dk-content-tertiary)]">
          对着报告问就行,选品官会引用当天真实榜单数据回答
        </p>
      </div>

      {tasks.length > 0 && (
        <div className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto px-5 py-4">
          {tasks.map((t) => (
            <ChatTurn key={t.id} task={t} workspaceId={workspaceId} />
          ))}
        </div>
      )}

      <div className="px-4 pb-4 pt-3">
        {showSuggestions && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setDraft(q);
                  composerRef.current?.focus();
                }}
                className="press rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 py-1.5 text-xs text-[var(--dk-content-secondary)] transition-colors hover:bg-[var(--dk-action-regular)] hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <ComposerForm
          variant="compact"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {focusProduct && (
            <div className="flex items-center gap-1.5 px-3 pt-2.5">
              <Badge tone="brand" outline={false} className="max-w-full">
                <span className="truncate">聚焦:{focusProduct.name}</span>
                <button type="button" onClick={clearFocus} aria-label="取消聚焦" className="ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
          <ComposerTextarea
            ref={composerRef}
            variant="compact"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              reportReady
                ? "例:这几个品里哪个最适合我先试? Enter 发送"
                : "报告生成中也可以先问,选品官会基于现有榜单数据回答"
            }
          />
          <ComposerToolbar variant="compact" className="justify-between">
            <CreditCost credits={CREDIT_COST.agentTask} />
            <ComposerSendButton size="default" type="submit" disabled={sending || !draft.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "发送"}
            </ComposerSendButton>
          </ComposerToolbar>
        </ComposerForm>
        {sendError && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-600">
            <CircleAlert className="h-3.5 w-3.5" /> {sendError}
          </div>
        )}
        {isGuest && (
          <p className="mt-2 text-xs text-[var(--dk-content-tertiary)]">
            报告免费看;追问需要先登录,登录即送体验积分
          </p>
        )}
      </div>
    </Card>
  );
}

/** 一轮问答:右侧用户气泡 + 左侧选品官回答(流式/轮询)。 */
function ChatTurn({ task, workspaceId }: { task: ScoutTask; workspaceId: string }) {
  const running = task.status === "QUEUED" || task.status === "RUNNING";
  const streamed = useScoutStream(task.id, workspaceId, running);
  const answer = task.output?.trim() || streamed;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="self-end rounded-2xl rounded-br-md bg-[var(--dk-btn-black)] px-3.5 py-2 text-[13px] leading-relaxed text-white sm:max-w-[85%]">
        {task.input}
      </div>
      <div className="flex items-start gap-2.5 self-start sm:max-w-[92%]">
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <BrandMark className="h-4 w-4" />
        </div>
        <div className="min-w-0 rounded-2xl rounded-tl-md border border-[var(--dk-stroke-overlay)] bg-white px-3.5 py-2.5">
          {task.status === "FAILED" ? (
            <div className="flex items-center gap-1.5 text-[13px] text-rose-600">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" />
              {task.errorMessage || "回答失败,请重新提问"}
            </div>
          ) : answer ? (
            <Markdown className="text-[13px] text-ink">{answer}</Markdown>
          ) : (
            <div className="flex items-center gap-2 py-0.5 text-[13px] text-[var(--dk-content-tertiary)]">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> 选品官正在核对数据…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** SSE 订阅在跑任务的实时正文;终态由轮询到的 output 接管(与工作台 task-stream 同一口径)。 */
function useScoutStream(taskId: string, workspaceId: string, running: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!running || !workspaceId) return;
    const es = new EventSource(
      `/api/v1/workspaces/${workspaceId}/agent-tasks/${taskId}/stream`,
      { withCredentials: true },
    );
    es.addEventListener("delta", (e) => {
      try {
        setText((prev) => prev + (JSON.parse((e as MessageEvent).data).text ?? ""));
      } catch {
        // 单帧解析失败不致命:轮询兜底
      }
    });
    es.addEventListener("done", () => es.close());
    es.addEventListener("idle", () => es.close());
    es.onerror = () => es.close();
    return () => {
      es.close();
      setText("");
    };
  }, [running, taskId, workspaceId]);
  return text;
}
