"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import { LoginPromptModal } from "@/components/LoginPromptModal";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { type Tone } from "@/lib/ui/tokens";
import { TrendChart } from "../_components/TrendChart";
import { fmt, fmtMoney, initial, fmtUnixDate, stringToGradient } from "../_components/format";
import {
  Sparkles,
  Plus,
  Loader2,
  Star,
  ArrowLeft,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Users,
  Video,
  Play,
  ShieldCheck,
  Truck,
} from "lucide-react";

type Signal = { key: string; label: string; tone: string; value: string; hint: string };

export type DetailProduct = {
  productId: string;
  name: string;
  region: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  commissionRate: number;
  totalSaleCnt: number;
  totalSaleGmv: number;
  totalIflCnt: number;
  totalVideoCnt: number;
  totalLiveCnt: number;
  coverUrls: string[];
  rating: number;
  reviewCount: number;
  discount: string;
  freeShipping: boolean;
  description: string;
  windows: {
    sale7dCnt: number;
    sale30dCnt: number;
    sale90dCnt: number;
    gmv7d: number;
    gmv30d: number;
    video7dCnt: number;
    video30dCnt: number;
  } | null;
  influencers: {
    userId: string;
    nickName: string;
    avatar: string;
    category: string;
    followers: number;
    perProductGmv: number;
    perProductSaleCnt: number;
  }[];
  videos: {
    videoId: string;
    cover: string;
    desc: string;
    playAddr: string;
    createTime: string;
    views: number;
    digg: number;
    comments: number;
    shares: number;
    saleCnt: number;
    saleGmv: number;
  }[];
  trend: { dt: string; saleCnt: number; gmv: number }[];
  score: { score: number; verdict: string; signals: Signal[] } | null;
  importedProductId: string | null;
  interaction: { isStarred: boolean; tags: string[] } | null;
};

function asTone(t: string): Tone {
  const ok: Tone[] = ["brand", "neutral", "success", "warning", "danger", "info", "violet", "fuchsia"];
  return (ok as string[]).includes(t) ? (t as Tone) : "neutral";
}

/** 图片(签名 URL),加载失败回退渐变占位。 */
function Img({ src, seed, className }: { src: string; seed: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center text-white font-semibold ${className}`}
        style={{ background: stringToGradient(seed) }}
      >
        {initial(seed)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={className} loading="lazy" onError={() => setFailed(true)} />;
}

export function ProductDetailClient({
  product: p,
  workspaceId,
  isGuest,
}: {
  product: DetailProduct;
  workspaceId: string;
  isGuest: boolean;
}) {
  const router = useRouter();
  const [gallery, setGallery] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [starred, setStarred] = useState(p.interaction?.isStarred ?? false);
  const [busy, setBusy] = useState<"" | "star" | "import" | "analyze">("");
  const [imported, setImported] = useState<string | null>(p.importedProductId);

  function gateGuest(): boolean {
    if (!isGuest) return false;
    setLoginOpen(true);
    return true;
  }

  async function toggleStar() {
    if (busy || gateGuest()) return;
    const next = !starred;
    setStarred(next);
    setBusy("star");
    try {
      await apiBrowser(`/workspaces/${workspaceId}/discover/interactions`, {
        method: "POST",
        body: JSON.stringify({ externalId: p.productId, region: p.region, isStarred: next }),
      });
      if (next) toast.success("已收藏");
    } catch {
      setStarred(!next);
      toast.error("收藏失败");
    } finally {
      setBusy("");
    }
  }

  async function importProduct() {
    if (busy || gateGuest()) return;
    setBusy("import");
    try {
      const data = await apiBrowser<{ alreadyExists: boolean; product?: { id: string } }>(
        `/workspaces/${workspaceId}/discover/import-product`,
        {
          method: "POST",
          body: JSON.stringify({ productId: p.productId, region: p.region, categoryLabel: "TikTok 爆品" }),
        },
      );
      setImported(data.product?.id ?? "added");
      toast.success(data.alreadyExists ? "选品库里已经有了" : "已加入选品库");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setBusy("");
    }
  }

  async function analyzeProduct() {
    if (busy || gateGuest()) return;
    setBusy("analyze");
    try {
      const start = await apiBrowser<{ task: { id: string } }>(
        `/workspaces/${workspaceId}/discover/analyze`,
        { method: "POST", body: JSON.stringify({ productId: p.productId, region: p.region }) },
      );
      const taskId = start.task.id;
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const cur = await apiBrowser<{ task: { status: string; output: string | null } }>(
          `/workspaces/${workspaceId}/agent-tasks/${taskId}`,
        );
        if (cur.task.status === "DONE") {
          toast.success("AI 分析完成", { description: cur.task.output ?? undefined, duration: 12000 });
          return;
        }
        if (cur.task.status === "FAILED") {
          toast.error("分析失败", { description: cur.task.output ?? "请稍后重试" });
          return;
        }
      }
      toast.message("分析仍在进行", { description: "稍后可在工作台查看结果" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setBusy("");
    }
  }

  const score = p.score;
  const scoreTone: Tone = !score
    ? "neutral"
    : score.score >= 75
      ? "success"
      : score.score >= 55
        ? "brand"
        : "warning";
  const scoreColor =
    scoreTone === "success" ? "#16a34a" : scoreTone === "brand" ? "#7c3aed" : "#d97706";

  return (
    <div className="space-y-6">
      {loginOpen && (
        <LoginPromptModal
          onClose={() => setLoginOpen(false)}
          callbackUrl={`/app/discover/products/${p.productId}?region=${p.region}`}
          title="登录后即可操作"
          desc="导入选品、收藏、AI 分析都需要账号。详情随便看,登录后一键操作。"
        />
      )}

      <Link
        href="/app/discover/products"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> 返回爆品榜
      </Link>

      <PageHeader
        title={<span className="line-clamp-2">{p.name}</span>}
        badge={<Badge tone="neutral">{p.region}</Badge>}
        description={
          <span className="font-mono text-xs">
            {p.productId}
            {p.discount && p.discount !== "0" ? ` · 折扣 ${p.discount}` : ""}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={toggleStar} disabled={busy === "star"}>
              <Star className={`h-3.5 w-3.5 ${starred ? "fill-amber-400 text-amber-400" : ""}`} />
              {starred ? "已收藏" : "收藏"}
            </Button>
            <Button variant="subtle" size="sm" onClick={analyzeProduct} disabled={busy === "analyze"}>
              {busy === "analyze" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              AI 深度分析
            </Button>
            {imported ? (
              <Button variant="secondary" size="sm" onClick={() => router.push("/app/assets/products")}>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 已加入
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={importProduct} disabled={busy === "import"}>
                {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                加入选品库
              </Button>
            )}
          </>
        }
      />

      {/* Hero:图廊 + 关键属性 */}
      <Card className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <Img
            src={p.coverUrls[gallery] ?? ""}
            seed={p.name}
            className="aspect-square w-full rounded-xl object-cover bg-zinc-100"
          />
          {p.coverUrls.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {p.coverUrls.slice(0, 8).map((u, i) => (
                <button
                  key={i}
                  onClick={() => setGallery(i)}
                  className={`h-12 w-12 flex-shrink-0 overflow-hidden rounded-md ring-2 ${
                    i === gallery ? "ring-brand-500" : "ring-transparent"
                  }`}
                >
                  <Img src={u} seed={p.name + i} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <div className="text-xs text-zinc-500">售价区间</div>
              <div className="text-2xl font-semibold tabular-nums">
                ${p.minPrice.toFixed(2)}
                {p.maxPrice > p.minPrice && (
                  <span className="text-zinc-400"> – ${p.maxPrice.toFixed(2)}</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">均价 ${p.avgPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">佣金率</div>
              <div className="text-2xl font-semibold tabular-nums text-emerald-700">
                {(p.commissionRate * 100).toFixed(0)}%
              </div>
            </div>
            {p.rating > 0 && (
              <div>
                <div className="text-xs text-zinc-500">评分</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {p.rating.toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-zinc-400">
                    ({fmt(p.reviewCount)} 评价)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {p.freeShipping && (
              <Badge tone="success" icon={<Truck className="h-3 w-3" />}>包邮</Badge>
            )}
            {p.discount && p.discount !== "0" && (
              <Badge tone="fuchsia">折扣 {p.discount}</Badge>
            )}
            {imported && (
              <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>已在选品库</Badge>
            )}
          </div>

          {p.description && (
            <p className="text-sm leading-relaxed text-zinc-600 line-clamp-4">{p.description}</p>
          )}
        </div>
      </Card>

      {/* 选品诊断评分 */}
      {score && (
        <Card className="relative overflow-hidden">
          <div className="aura-violet pointer-events-none absolute -right-10 -top-10 h-40 w-40" />
          <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl text-white shadow-sm"
                style={{ background: scoreColor }}
              >
                <span className="text-3xl font-bold tabular-nums leading-none">{score.score}</span>
                <span className="mt-0.5 text-[10px] opacity-90">选品评分</span>
              </div>
              <div className="sm:hidden">
                <Badge tone={scoreTone}>{score.score >= 75 ? "值得一试" : score.score >= 55 ? "可考虑" : "谨慎"}</Badge>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <span className="text-sm font-medium text-zinc-900">选品诊断</span>
                <span className="hidden sm:inline">
                  <Badge tone={scoreTone}>
                    {score.score >= 75 ? "值得一试" : score.score >= 55 ? "可考虑" : "谨慎"}
                  </Badge>
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-600">{score.verdict}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {score.signals.map((s) => (
                  <div key={s.key} className="rounded-lg border border-zinc-200/70 bg-white p-3">
                    <div className="text-xs text-zinc-500">{s.label}</div>
                    <div className="mt-1">
                      <Badge tone={asTone(s.tone)}>{s.value}</Badge>
                    </div>
                    <div className="mt-1.5 text-2xs leading-snug text-zinc-400">{s.hint}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="总销量"
          value={fmt(p.totalSaleCnt)}
          hint={p.windows ? `近7天 ${fmt(p.windows.sale7dCnt)} · 近30天 ${fmt(p.windows.sale30dCnt)}` : undefined}
        />
        <Stat
          icon={DollarSign}
          label="总 GMV"
          value={fmtMoney(p.totalSaleGmv)}
          hint={p.windows ? `近7天 ${fmtMoney(p.windows.gmv7d)} · 近30天 ${fmtMoney(p.windows.gmv30d)}` : undefined}
        />
        <Stat icon={Users} label="带货达人" value={fmt(p.totalIflCnt)} hint="累计合作达人数" />
        <Stat
          icon={Video}
          label="带货视频"
          value={fmt(p.totalVideoCnt)}
          hint={p.windows ? `近7天 +${fmt(p.windows.video7dCnt)}` : undefined}
        />
      </div>

      {/* 趋势图 */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-medium text-zinc-900">销量 / GMV 趋势(近 14 天)</span>
        </div>
        <TrendChart data={p.trend} />
      </Card>

      {/* Top 带货达人 */}
      {p.influencers.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-zinc-900">Top 带货达人</span>
            <span className="text-xs text-zinc-400">按单品 GMV 排序</span>
          </div>
          <div className="divide-y divide-zinc-100">
            {p.influencers.map((inf) => (
              <div key={inf.userId} className="flex items-center gap-3 py-2.5">
                <Img src={inf.avatar} seed={inf.nickName} className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-900">{inf.nickName}</div>
                  <div className="truncate text-xs text-zinc-500">
                    {inf.category || "—"} · {fmt(inf.followers)} 粉丝
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-zinc-900">{fmtMoney(inf.perProductGmv)}</div>
                  <div className="text-2xs text-zinc-400">单品 GMV · {fmt(inf.perProductSaleCnt)} 件</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 关联热门视频 */}
      {p.videos.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Video className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-medium text-zinc-900">关联热门视频</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {p.videos.map((v) => {
              const playable = v.playAddr?.startsWith("http");
              const inner = (
                <>
                  <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-zinc-100">
                    <Img src={v.cover} seed={v.videoId} className="h-full w-full object-cover" />
                    {playable && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-8 w-8 text-white drop-shadow" />
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs text-white tabular-nums">
                      {fmt(v.views)} 播放
                    </div>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-xs text-zinc-600">{v.desc || "—"}</div>
                  <div className="mt-0.5 flex items-center justify-between text-2xs text-zinc-400 tabular-nums">
                    <span>{fmtUnixDate(v.createTime)}</span>
                    <span className="text-emerald-600">带货 {fmt(v.saleCnt)}</span>
                  </div>
                </>
              );
              return playable ? (
                <a key={v.videoId} href={v.playAddr} target="_blank" rel="noopener noreferrer" className="group block">
                  {inner}
                </a>
              ) : (
                <div key={v.videoId} className="group block">
                  {inner}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
