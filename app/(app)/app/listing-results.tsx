"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Hash, Images, Loader2, RefreshCw, Star } from "lucide-react";
import { CreditCost } from "@/components/ui/CreditCost";
import { CREDIT_COST } from "@/lib/credits";
import { authFetch } from "@/lib/api-browser";
import { type StreamTask } from "./task-stream";

type ListingMeta = NonNullable<StreamTask["metadata"]>;

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label}已复制`),
    () => toast.error("复制失败，请手动选择文本"),
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  return (
    <button
      onClick={() => copy(text, label)}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--dk-stroke-border)] bg-white px-2 py-0.5 text-2xs font-medium text-zinc-500 transition-colors hover:bg-[var(--dk-action-regular)] hover:text-ink"
      title={`复制${label}`}
    >
      <Copy className="h-2.5 w-2.5" />
      复制
    </button>
  );
}

/**
 * LISTING 任务的结构化结果卡：标题/五点/A+/标签逐区块可复制,
 * 主图走「确认生成」流程（同 DIRECTOR 出片）:PENDING 出按钮 → RUNNING 组件内轮询 → DONE 图片网格。
 * 工作台全局轮询只管 QUEUED/RUNNING 任务，出图发生在任务 DONE 之后，所以这里自己轮询。
 */
export function ListingResults({ task }: { task: StreamTask }) {
  const [meta, setMeta] = useState<ListingMeta>(task.metadata ?? {});
  const [submitting, setSubmitting] = useState(false);
  // 主图回写商品：记录已设为主图的那张 + 正在回写的那张。
  const [appliedUrl, setAppliedUrl] = useState<string | null>(null);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const running = meta.imagesStatus === "RUNNING";

  async function setAsCover(url: string) {
    if (!meta.productId || applyingUrl) return;
    setApplyingUrl(url);
    try {
      const res = await authFetch(
        `/api/v1/workspaces/${task.workspaceId}/products/${meta.productId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: url }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error?.message || "回写失败，稍后再试");
        return;
      }
      setAppliedUrl(url);
      toast.success("已设为商品主图");
    } catch {
      toast.error("网络异常，稍后再试");
    } finally {
      setApplyingUrl(null);
    }
  }

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const res = await authFetch(
          `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}`,
        );
        const json = await res.json().catch(() => null);
        const fresh = (json?.data?.task ?? json?.task) as StreamTask | undefined;
        if (res.ok && fresh?.metadata) setMeta(fresh.metadata);
      } catch {
        // 网络抖动忽略，下个周期重试
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [running, task.workspaceId, task.id]);

  async function generateImages() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await authFetch(
        `/api/v1/workspaces/${task.workspaceId}/agent-tasks/${task.id}/images`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error?.message || "提交失败，稍后再试");
        return;
      }
      setMeta((m) => ({ ...m, imagesStatus: "RUNNING" }));
      toast.success("已开始生成主图，约 1-2 分钟");
    } catch {
      toast.error("网络异常，稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  const points = meta.sellingPoints ?? [];
  const sections = meta.aplusSections ?? [];
  const prompts = meta.imagePrompts ?? [];
  const tags = meta.hashtags ?? [];
  const images = meta.images ?? [];

  return (
    <div className="space-y-2.5 text-sm">
      {/* 标题 */}
      {meta.title && (
        <div className="rounded-lg border border-[var(--dk-stroke-border)] bg-[var(--dk-surface-2)] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-2xs font-medium text-zinc-400">Listing 标题</div>
              <div className="mt-0.5 font-medium leading-relaxed text-ink">{meta.title}</div>
            </div>
            <CopyBtn text={meta.title} label="标题" />
          </div>
        </div>
      )}

      {/* 五点卖点 */}
      {points.length > 0 && (
        <div className="rounded-lg border border-[var(--dk-stroke-border)] bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-2xs font-medium text-zinc-400">五点卖点</div>
            <CopyBtn text={points.join("\n")} label="五点卖点" />
          </div>
          <ol className="mt-1.5 space-y-1">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2 leading-relaxed text-zinc-900">
                <span className="shrink-0 font-mono text-2xs leading-5 text-zinc-400">{i + 1}.</span>
                {p}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 图文详情结构 */}
      {sections.length > 0 && (
        <div className="rounded-lg border border-[var(--dk-stroke-border)] bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-2xs font-medium text-zinc-400">图文详情结构</div>
            <CopyBtn
              text={sections.map((s) => `${s.heading}\n${s.body}\n配图 prompt: ${s.imagePrompt}`).join("\n\n")}
              label="图文详情"
            />
          </div>
          <div className="mt-1.5 space-y-2">
            {sections.map((s, i) => (
              <div key={i} className="rounded-lg bg-[var(--dk-surface-2)] px-2.5 py-2">
                <div className="text-xs font-semibold text-ink">{s.heading}</div>
                <div className="mt-0.5 leading-relaxed text-zinc-600">{s.body}</div>
                {s.imagePrompt && (
                  <div className="mt-1 text-2xs leading-relaxed text-zinc-400">配图：{s.imagePrompt}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主图：已出图展示网格；否则按 imagesStatus 走确认生成流程 */}
      {(prompts.length > 0 || images.length > 0) && (
        <div className="rounded-lg border border-[var(--dk-stroke-border)] bg-white px-3 py-2.5">
          <div className="text-2xs font-medium text-zinc-400">Listing 主图</div>
          {images.length > 0 ? (
            <>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {images.map((url, i) => {
                  const applied = appliedUrl === url;
                  return (
                    <div key={i} className="space-y-1">
                      <a href={url} target="_blank" rel="noreferrer" title="点击查看原图" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Listing 主图 ${i + 1}`}
                          className="aspect-square w-full rounded-lg border border-[var(--dk-stroke-border)] object-cover transition-opacity hover:opacity-90"
                        />
                      </a>
                      {meta.productId && (
                        <button
                          onClick={() => setAsCover(url)}
                          disabled={applyingUrl != null || applied}
                          className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1 text-2xs font-medium transition-colors disabled:pointer-events-none ${
                            applied
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-[var(--dk-stroke-border)] bg-white text-zinc-500 hover:bg-[var(--dk-action-regular)] hover:text-ink"
                          }`}
                        >
                          {applyingUrl === url ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : applied ? (
                            <Check className="h-2.5 w-2.5" />
                          ) : (
                            <Star className="h-2.5 w-2.5" />
                          )}
                          {applied ? "已设为主图" : "设为主图"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {meta.productId && (
                <p className="mt-1.5 text-2xs text-zinc-400">
                  设为主图后，会回写到收藏里的该商品（替换原图），做视频选商品时即用这张。
                </p>
              )}
            </>
          ) : (
            <>
              <ol className="mt-1.5 space-y-1">
                {prompts.map((p, i) => (
                  <li key={i} className="flex gap-2 text-2xs leading-relaxed text-zinc-500">
                    <span className="shrink-0 font-mono text-zinc-400">{i + 1}.</span>
                    {p}
                  </li>
                ))}
              </ol>
              {running ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在生成主图，约 1-2 分钟，完成后会出现在这里…
                </div>
              ) : meta.imagesStatus === "PENDING" || meta.imagesStatus === "FAILED" ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    onClick={generateImages}
                    disabled={submitting}
                    className="press inline-flex items-center gap-1.5 rounded-lg bg-[var(--dk-btn-black)] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] hover:bg-[var(--dk-btn-black-hover)] disabled:pointer-events-none disabled:bg-[var(--dk-btn-tertiary)] disabled:text-[var(--dk-content-tertiary)] disabled:shadow-none"
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : meta.imagesStatus === "FAILED" ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Images className="h-3.5 w-3.5" />
                    )}
                    {submitting
                      ? "提交中…"
                      : meta.imagesStatus === "FAILED"
                        ? "重试生成主图"
                        : "生成 Listing 主图"}
                  </button>
                  <CreditCost credits={CREDIT_COST.image * Math.min(prompts.length, 3)} />
                  <span className="text-2xs text-zinc-400">
                    {meta.imagesStatus === "FAILED"
                      ? "上次生成失败，可直接重试"
                      : `最多出 ${Math.min(prompts.length, 3)} 张 · 确认后才消耗积分`}
                    {meta.coverUrl ? " · 以商品实拍图为参考，真货入画" : ""}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* 标签 */}
      {tags.length > 0 && (
        <div className="rounded-lg border border-[var(--dk-stroke-border)] bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 text-2xs font-medium text-zinc-400">
              <Hash className="h-2.5 w-2.5" />
              TikTok 标签
            </div>
            <CopyBtn text={tags.join(" ")} label="标签" />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-[var(--dk-surface-2)] px-2 py-0.5 text-2xs text-zinc-600"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
