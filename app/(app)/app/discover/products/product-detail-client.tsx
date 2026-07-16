"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useReportPageEntity } from "../../page-entity";
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
  Loader2,
  Bookmark,
  BookmarkCheck,
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Users,
  Video,
  Play,
  Heart,
  ShieldCheck,
  Truck,
  Search,
  ExternalLink,
} from "lucide-react";

type Signal = { key: string; label: string; tone: string; value: string; hint: string };

export type DetailProduct = {
  productId: string;
  name: string;
  nameZh: string;
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
};

function asTone(t: string): Tone {
  const ok: Tone[] = ["brand", "neutral", "success", "warning", "danger", "info", "violet", "fuchsia"];
  return (ok as string[]).includes(t) ? (t as Tone) : "neutral";
}

// 搜同款货源：按品名关键词直达各平台（纯 deep-link,无需 API/凭证）。
// 完整标题搜不出货源，取前几个词作关键词。1688/CJ 的「按图搜」需签名 API,见后续 P3。
function sourcingKeyword(name: string): string {
  return name
    .replace(/[|/–—\-_,]+/g, " ") // 分隔符/标点当空格
    .split(/\s+/)
    .filter((w) => /[a-z0-9一-龥]/i.test(w)) // 丢掉纯符号 token
    .slice(0, 5)
    .join(" ");
}

function sourcingLinks(name: string): { label: string; href: string; note: string }[] {
  const q = encodeURIComponent(sourcingKeyword(name));
  return [
    { label: "1688 搜同款", href: `https://s.1688.com/selloffer/offer_search.htm?keywords=${q}`, note: "国内货源 · 批发价" },
    {
      label: "CJ 搜同款",
      href: `https://cjdropshipping.com/list/wholesale-all-categories-l-all.html?keyWord=${q}`,
      note: "跨境一件代发",
    },
    { label: "AliExpress 搜同款", href: `https://www.aliexpress.com/wholesale?SearchText=${q}`, note: "速卖通零售对比" },
  ];
}

/** 图片（签名 URL），加载失败回退渐变占位。 */
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
  const [busy, setBusy] = useState<"" | "import" | "analyze">("");
  const [imported, setImported] = useState<string | null>(p.importedProductId);
  const { open: openAuthModal } = useAuthModal();
  // 上报当前商品给情境助手；已导入的带自建商品 id，composer 可结构化消费
  useReportPageEntity({
    kind: "discover-product",
    id: p.productId,
    name: p.nameZh || p.name,
    productId: imported ?? undefined,
  });

  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可操作",
      desc: "收藏、AI 分析都需要账号。详情随便看，登录后一键操作。",
    });
    return true;
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
      toast.success(data.alreadyExists ? "已经收藏过了" : "已收藏");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "收藏失败");
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
      toast.error(e instanceof Error ? e.message : "分析失败，稍后再试");
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
    scoreTone === "success" ? "#16a34a" : scoreTone === "brand" ? "#3046b8" : "#d97706";

  const hasDiscount =
    !!p.discount && p.discount !== "0" && p.discount !== "null";

  return (
    <div className="space-y-6">
      <Link
        href="/app/discover/products"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" /> 返回爆品榜
      </Link>

      <PageHeader
        title={<span className="line-clamp-2">{p.nameZh || p.name}</span>}
        description={
          <span className="flex flex-col gap-1">
            {p.nameZh && p.nameZh !== p.name && (
              <span className="line-clamp-2 text-xs text-zinc-400">{p.name}</span>
            )}
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{p.region}</Badge>
              <span className="font-mono text-xs">{p.productId}</span>
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="subtle" size="sm" onClick={analyzeProduct} disabled={busy === "analyze"}>
              {busy === "analyze" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              AI 深度分析
            </Button>
            {imported ? (
              <Button variant="secondary" size="sm" onClick={() => router.push("/app/discover/favorites")}>
                <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600" /> 已收藏
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={importProduct} disabled={busy === "import"}>
                {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
                收藏
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
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div>
              <div className="text-xs text-zinc-500">售价区间</div>
              <div className="mt-0.5 text-2xl font-semibold leading-7 tabular-nums">
                ${p.minPrice.toFixed(2)}
                {p.maxPrice > p.minPrice && (
                  <span className="text-zinc-400"> – ${p.maxPrice.toFixed(2)}</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">均价 ${p.avgPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">佣金率</div>
              <div className="mt-0.5 text-2xl font-semibold leading-7 tabular-nums text-emerald-700">
                {(p.commissionRate * 100).toFixed(0)}%
              </div>
            </div>
            {p.rating > 0 && (
              <div>
                <div className="text-xs text-zinc-500">评分</div>
                <div className="mt-0.5 text-2xl font-semibold leading-7 tabular-nums">
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
            {hasDiscount && (
              <Badge tone="fuchsia">折扣 {p.discount}</Badge>
            )}
            {imported && (
              <Badge tone="success" icon={<BookmarkCheck className="h-3 w-3" />}>已收藏</Badge>
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
          <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 flex-col items-center justify-center rounded-xl text-white shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]"
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
                  <div key={s.key} className="rounded-lg border border-[var(--dk-stroke-border)] bg-white p-3">
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

      {/* 货源比价 · 搜同款（deep-link,无 API） */}
      <Card>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-medium text-zinc-900">搜同款 · 比价拿真实货价</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          评分里的成本/利润是按品类估算的。去货源平台搜「<span className="font-medium text-zinc-900">{sourcingKeyword(p.name)}</span>
          」找同款，拿到真实进货价后在收藏夹回填，毛利率就准了。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sourcingLinks(p.name).map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              title={l.note}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dk-stroke-border)] bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-[var(--dk-action-regular)]"
            >
              {l.label}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          ))}
        </div>
        <p className="mt-2 text-2xs text-zinc-400">
          按图搜同款最准：保存上方商品主图，到平台点相机图标上传（自动按图比价为后续功能）。
        </p>
      </Card>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="总销量"
          value={fmt(p.totalSaleCnt)}
          hint={p.windows ? `近 7 天 ${fmt(p.windows.sale7dCnt)} · 近 30 天 ${fmt(p.windows.sale30dCnt)}` : undefined}
        />
        <Stat
          icon={DollarSign}
          label="总 GMV"
          value={fmtMoney(p.totalSaleGmv)}
          hint={p.windows ? `近 7 天 ${fmtMoney(p.windows.gmv7d)} · 近 30 天 ${fmtMoney(p.windows.gmv30d)}` : undefined}
        />
        <Stat icon={Users} label="带货达人" value={fmt(p.totalIflCnt)} hint="累计合作达人数" />
        <Stat
          icon={Video}
          label="带货视频"
          value={fmt(p.totalVideoCnt)}
          hint={p.windows ? `近 7 天 +${fmt(p.windows.video7dCnt)}` : undefined}
        />
      </div>

      {/* 趋势图 */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-medium text-zinc-900">销量 / GMV 趋势（近 14 天）</span>
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
          <div className="divide-y divide-[var(--dk-stroke-divider)]">
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
            <span className="text-xs text-zinc-400">共 {p.videos.length} 条 · 按带货量排序</span>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[...p.videos]
              .sort((a, b) => b.saleCnt - a.saleCnt || b.views - a.views)
              .map((v) => {
              const playable = v.playAddr?.startsWith("http");
              const inner = (
                <>
                  <div className="relative aspect-[9/16] overflow-hidden rounded-t-lg bg-zinc-100">
                    <Img
                      src={v.cover}
                      seed={v.videoId}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* 顶部：播放量 + 带货徽标 */}
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-2xs font-medium text-white tabular-nums backdrop-blur-sm">
                        <Play className="h-2.5 w-2.5 fill-current" />
                        {fmt(v.views)}
                      </span>
                      {v.saleCnt > 0 && (
                        <span className="inline-flex items-center rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-2xs font-medium text-white tabular-nums backdrop-blur-sm">
                          带货 {fmt(v.saleCnt)}
                        </span>
                      )}
                    </div>
                    {playable && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                          <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                        </span>
                      </div>
                    )}
                    {/* 底部渐变 + 点赞 / 日期 */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2 pb-1.5 pt-6 text-2xs text-white tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {fmt(v.digg)}
                      </span>
                      <span className="text-white/80">{fmtUnixDate(v.createTime)}</span>
                    </div>
                  </div>
                  <div className="px-2.5 pb-2.5 pt-2">
                    {v.desc ? (
                      <p className="line-clamp-2 min-h-8 text-xs leading-4 text-zinc-600 transition-colors group-hover:text-zinc-900">
                        {v.desc}
                      </p>
                    ) : (
                      <p className="min-h-8 text-xs leading-4 text-zinc-400">无文案</p>
                    )}
                  </div>
                </>
              );
              const shell = "group block overflow-hidden dk-card dk-lift";
              return playable ? (
                <a key={v.videoId} href={v.playAddr} target="_blank" rel="noopener noreferrer" className={shell}>
                  {inner}
                </a>
              ) : (
                <div key={v.videoId} className={shell}>
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
