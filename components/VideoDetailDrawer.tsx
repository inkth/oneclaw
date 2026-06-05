"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X,
  Loader2,
  Download,
  Trash2,
  Copy,
  Package,
  UserSquare2,
  Bookmark,
  Wand2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
  Film,
  Music,
  Tag,
} from "lucide-react";

type Processing = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

type VideoFull = {
  id: string;
  title: string;
  style: string;
  processing: Processing;
  engine: string | null;
  falModel: string | null;
  falRequestId: string | null;
  aspectRatio: string | null;
  durationSec: number;
  prompt: string | null;
  script: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  costCents: number;
  errorMessage: string | null;
  views: number;
  likes: number;
  saves: number;
  revenueCents: number;
  createdAt: string;
  updatedAt: string;
  referenceMaterialIds: string[];
  product?: { id: string; title: string; emoji: string | null; status: string } | null;
  modelAsset?: {
    id: string;
    name: string;
    avatarUrl: string | null;
    kind: string;
    gender: string;
    style: string | null;
  } | null;
  template?: { id: string; name: string; emoji: string | null } | null;
  materials?: Array<{
    id: string;
    type: string;
    originalName: string;
    url: string;
    contentType: string | null;
    sizeBytes: number;
  }>;
};

const PROCESSING_META: Record<
  Processing,
  { cn: string; cls: string; icon: typeof CheckCircle2 }
> = {
  PENDING: { cn: "排队中", cls: "bg-zinc-100 text-zinc-600", icon: Loader2 },
  GENERATING: { cn: "生成中", cls: "bg-amber-50 text-amber-700", icon: Loader2 },
  COMPLETED: { cn: "已完成", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  FAILED: { cn: "失败", cls: "bg-rose-50 text-rose-700", icon: AlertTriangle },
};

const STYLE_CN: Record<string, string> = {
  UNBOXING: "开箱",
  COMPARISON: "对比",
  SCENE: "场景",
  BEFORE_AFTER: "Before/After",
};

const MAT_ICON: Record<string, typeof ImageIcon> = {
  IMAGE: ImageIcon,
  LOGO: ImageIcon,
  WATERMARK: ImageIcon,
  VIDEO: Film,
  AUDIO: Music,
  FONT: Tag,
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function VideoDetailDrawer({
  workspaceId,
  videoId,
  onClose,
  onDeleted,
}: {
  workspaceId: string;
  videoId: string;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const [video, setVideo] = useState<VideoFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/workspaces/${workspaceId}/videos/${videoId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) {
          setError(j.error?.message || "加载失败");
        } else {
          setVideo(j.data.video as VideoFull);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "网络错误");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [workspaceId, videoId]);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function refresh() {
    if (!video?.falRequestId) return;
    setBusy(true);
    const r = await fetch(
      `/api/workspaces/${workspaceId}/videos/${videoId}/refresh`,
      { method: "POST" },
    );
    const j = await r.json();
    setBusy(false);
    if (j.ok && j.data.video) {
      setVideo((prev) => (prev ? { ...prev, ...j.data.video } : prev));
      toast.success(`状态：${j.data.video.processing}`);
    } else {
      toast.error(j.error?.message || "刷新失败");
    }
  }

  async function del() {
    if (!video) return;
    if (!confirm(`删除视频「${video.title}」？`)) return;
    setBusy(true);
    const r = await fetch(`/api/workspaces/${workspaceId}/videos/${videoId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (r.ok) {
      toast.success("已删除");
      onDeleted?.(videoId);
      onClose();
      router.refresh();
    } else {
      toast.error("删除失败");
    }
  }

  function copyPrompt() {
    if (!video?.prompt) return;
    navigator.clipboard.writeText(video.prompt);
    toast.success("Prompt 已复制");
  }

  function reuseInCreate() {
    if (!video?.prompt) return;
    const params = new URLSearchParams({
      prompt: video.prompt,
      engine: video.engine ?? "",
      aspect: video.aspectRatio ?? "9:16",
      duration: String(video.durationSec),
      style: video.style,
    });
    if (video.product?.id) params.set("product", video.product.id);
    if (video.modelAsset?.id) params.set("model", video.modelAsset.id);
    if (video.template?.id) params.set("template", video.template.id);
    if (video.referenceMaterialIds.length > 0) {
      params.set("materials", video.referenceMaterialIds.join(","));
    }
    router.push(`/app/create?${params.toString()}`);
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-zinc-100 px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-zinc-400 font-mono truncate">{videoId}</div>
            <h2 className="mt-0.5 text-sm font-semibold truncate">
              {video?.title ?? "加载中…"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}
          {error && !loading && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          {video && !loading && (
            <>
              {/* 视频预览 */}
              <div className="relative aspect-[9/14] w-full max-w-xs mx-auto rounded-xl overflow-hidden bg-zinc-900">
                {video.videoUrl ? (
                  <video
                    src={video.videoUrl}
                    controls
                    playsInline
                    poster={video.thumbnailUrl ?? undefined}
                    className="h-full w-full object-cover"
                  />
                ) : video.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-500 text-xs">
                    暂无预览
                  </div>
                )}
                <ProcessingChip processing={video.processing} />
              </div>

              {/* 关键 chip 区 */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <Chip
                  label={STYLE_CN[video.style] ?? video.style}
                  tone="zinc"
                  icon={Wand2}
                />
                {video.engine && <Chip label={video.engine} tone="violet" />}
                <Chip label={`${video.durationSec}s`} tone="zinc" />
                <Chip label={video.aspectRatio ?? "—"} tone="zinc" />
                {video.costCents > 0 && (
                  <Chip
                    label={`¢${video.costCents.toFixed(0)}`}
                    tone="amber"
                    title="估算成本"
                  />
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {video.videoUrl && (
                  <a
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`${video.title}.mp4`}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-2xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <Download className="h-3 w-3" />
                    下载
                  </a>
                )}
                {video.prompt && (
                  <>
                    <button
                      onClick={copyPrompt}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-2xs font-medium text-zinc-700 hover:bg-zinc-200"
                    >
                      <Copy className="h-3 w-3" />
                      复制 prompt
                    </button>
                    <button
                      onClick={reuseInCreate}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1.5 text-2xs font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      <Sparkles className="h-3 w-3" />
                      复用到创作工坊
                    </button>
                  </>
                )}
                {video.processing === "GENERATING" && video.falRequestId && (
                  <button
                    onClick={refresh}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-2xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Loader2 className="h-3 w-3" />
                    )}
                    刷新状态
                  </button>
                )}
                <button
                  onClick={del}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-2xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  删除
                </button>
              </div>

              {/* 错误信息 */}
              {video.errorMessage && (
                <Section title="错误信息" icon={AlertTriangle} tone="rose">
                  <pre className="rounded-lg bg-rose-50 px-3 py-2 text-2xs text-rose-700 whitespace-pre-wrap font-mono">
                    {video.errorMessage}
                  </pre>
                </Section>
              )}

              {/* Prompt */}
              {video.prompt && (
                <Section title="提示词 Prompt" icon={Wand2}>
                  <pre className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-3 text-[12px] text-zinc-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {video.prompt}
                  </pre>
                </Section>
              )}

              {/* Script */}
              {video.script && (
                <Section title="LLM 生成的脚本" icon={Sparkles}>
                  <pre className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-3 text-[12px] text-zinc-800 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                    {video.script}
                  </pre>
                </Section>
              )}

              {/* 关联：模板 / 商品 / 模特 */}
              {(video.template || video.product || video.modelAsset) && (
                <Section title="关联">
                  <div className="space-y-2">
                    {video.template && (
                      <RelationRow
                        icon={Bookmark}
                        emoji={video.template.emoji}
                        label="模板"
                        value={video.template.name}
                        href={`/app/create`}
                      />
                    )}
                    {video.product && (
                      <RelationRow
                        icon={Package}
                        emoji={video.product.emoji}
                        label="商品"
                        value={video.product.title}
                        secondary={`状态：${video.product.status}`}
                        href={`/app/assets/products`}
                      />
                    )}
                    {video.modelAsset && (
                      <RelationRow
                        icon={UserSquare2}
                        emoji={null}
                        label="模特"
                        value={video.modelAsset.name}
                        secondary={`${video.modelAsset.kind === "DIGITAL_HUMAN" ? "AI" : "真人"} · ${video.modelAsset.style ?? "—"}`}
                        href={`/app/assets/models`}
                      />
                    )}
                  </div>
                </Section>
              )}

              {/* 参考素材 */}
              {video.materials && video.materials.length > 0 && (
                <Section title={`参考素材（${video.materials.length}）`} icon={ImageIcon}>
                  <div className="grid grid-cols-3 gap-2">
                    {video.materials.map((m) => {
                      const Icon = MAT_ICON[m.type] ?? ImageIcon;
                      const isImg = m.type === "IMAGE" || m.type === "LOGO" || m.type === "WATERMARK";
                      return (
                        <a
                          key={m.id}
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative aspect-square rounded-md overflow-hidden border border-zinc-200 bg-zinc-50"
                          title={`${m.originalName} · ${fmtBytes(m.sizeBytes)}`}
                        >
                          {isImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.url} alt="" className="h-full w-full object-cover" />
                          ) : m.type === "VIDEO" ? (
                            <video src={m.url} className="h-full w-full object-cover" muted />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Icon className="h-5 w-5 text-zinc-400" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[8px] px-1 py-0.5 truncate">
                            {m.originalName}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* 技术参数 */}
              <Section title="技术参数">
                <dl className="grid grid-cols-2 gap-2 text-2xs">
                  <KV label="引擎 key" value={video.engine ?? "—"} mono />
                  <KV label="fal 模型" value={video.falModel ?? "—"} mono />
                  <KV label="fal 请求 ID" value={video.falRequestId ?? "—"} mono />
                  <KV label="比例" value={video.aspectRatio ?? "—"} />
                  <KV label="时长" value={`${video.durationSec}s`} />
                  <KV
                    label="估算成本"
                    value={video.costCents > 0 ? `¢${video.costCents}` : "—"}
                  />
                  <KV
                    label="创建于"
                    value={new Date(video.createdAt).toLocaleString("zh-CN")}
                  />
                  <KV
                    label="更新于"
                    value={new Date(video.updatedAt).toLocaleString("zh-CN")}
                  />
                </dl>
              </Section>

              {/* 数据指标 */}
              {(video.views > 0 || video.likes > 0 || video.revenueCents > 0) && (
                <Section title="发布数据">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Metric label="播放" value={video.views.toLocaleString()} />
                    <Metric label="点赞" value={video.likes.toLocaleString()} />
                    <Metric label="收藏" value={video.saves.toLocaleString()} />
                    <Metric
                      label="GMV"
                      value={`¢${video.revenueCents.toLocaleString()}`}
                    />
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function ProcessingChip({ processing }: { processing: Processing }) {
  const m = PROCESSING_META[processing];
  const Icon = m.icon;
  const spin = processing === "GENERATING" || processing === "PENDING";
  return (
    <span
      className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${m.cls}`}
    >
      <Icon className={`h-2.5 w-2.5 ${spin ? "animate-spin" : ""}`} />
      {m.cn}
    </span>
  );
}

const TONE_CHIP: Record<string, string> = {
  zinc: "bg-zinc-100 text-zinc-700",
  violet: "bg-violet-50 text-violet-700",
  amber: "bg-amber-50 text-amber-700",
};

function Chip({
  label,
  tone = "zinc",
  icon: Icon,
  title,
}: {
  label: string;
  tone?: keyof typeof TONE_CHIP;
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${TONE_CHIP[tone]}`}
      title={title}
    >
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

const SECTION_TONE: Record<string, string> = {
  zinc: "text-zinc-700",
  rose: "text-rose-700",
};

function Section({
  title,
  icon: Icon,
  tone = "zinc",
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof SECTION_TONE;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        className={`flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider mb-2 ${SECTION_TONE[tone]}`}
      >
        {Icon && <Icon className="h-3 w-3" />}
        {title}
      </div>
      {children}
    </section>
  );
}

function RelationRow({
  icon: Icon,
  emoji,
  label,
  value,
  secondary,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  emoji?: string | null;
  label: string;
  value: string;
  secondary?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 flex-shrink-0">
        {emoji ? <span className="text-base">{emoji}</span> : <Icon className="h-4 w-4 text-zinc-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xs text-zinc-500">{label}</div>
        <div className="text-xs font-medium truncate">{value}</div>
        {secondary && (
          <div className="text-2xs text-zinc-400 truncate">{secondary}</div>
        )}
      </div>
    </Link>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-zinc-50/60 px-2.5 py-2">
      <div className="text-2xs text-zinc-400 uppercase tracking-wider">{label}</div>
      <div
        className={`mt-0.5 text-zinc-800 truncate ${mono ? "font-mono text-2xs" : "text-2xs"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5">
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-2xs text-zinc-500">{label}</div>
    </div>
  );
}
