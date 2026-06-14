"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  X,
  Loader2,
  Download,
  Copy,
  Clapperboard,
  Images,
  ListChecks,
  Globe,
  ArrowRight,
} from "lucide-react";
import { REGIONS, REGION_LANG, type Region } from "../../discover/_components/regions";

type KitVideo = { id: string; title: string; videoUrl?: string | null; thumbnailUrl?: string | null };
type KitListing = { title: string; sellingPoints: string[]; hashtags: string[]; images?: string[] };
type Kit = {
  product: { id: string; title: string; emoji?: string | null; status: string };
  videos: KitVideo[];
  listing?: KitListing | null;
};

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label}已复制`),
    () => toast.error("复制失败,请手动选择"),
  );
}

// 目标市场的合规提醒(轻量,仅作清单提示,非法律意见)。
function regionNote(code: Region): string {
  if (code === "US") return "美区:确认销售税与类目资质,部分类目需认证";
  if (code === "GB" || code === "IE") return "英区:确认 VAT 与 UKCA/CE 标识";
  if (["DE", "FR", "IT", "ES"].includes(code)) return "欧盟:确认 VAT 与 CE/能效合规";
  if (["ID", "TH", "VN", "MY", "PH", "SG"].includes(code))
    return "东南亚:本地语言文案更易过审,确认本地清关与类目资质";
  return "确认目标市场的类目资质、税务与合规要求";
}

/**
 * 出海包 / 发布助手:把一个商品「手动发到 TikTok Shop」要用的料聚到一处 ——
 * 成片下载 + 主图下载 + 文案一键复制 + 按目标市场差异化的发布清单。
 * OneClaw 不真发布,这里把手动交接做顺。
 */
export function PublishKitDrawer({
  workspaceId,
  productId,
  onClose,
}: {
  workspaceId: string;
  productId: string;
  onClose: () => void;
}) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>("US");

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/workspaces/${workspaceId}/products/${productId}/publish-kit`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) setError(j.error?.message || j.message || "加载失败");
        else setKit(j.data.kit as Kit);
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
  }, [workspaceId, productId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const listing = kit?.listing ?? null;
  const lang = REGION_LANG[region] ?? "英语";
  const regionCn = REGIONS.find((r) => r.code === region)?.cn ?? "目标市场";

  function copyAll() {
    if (!listing) return;
    const block = [
      listing.title,
      "",
      listing.sellingPoints.map((p, i) => `${i + 1}. ${p}`).join("\n"),
      "",
      (listing.hashtags ?? []).join(" "),
    ].join("\n");
    copy(block, "全部文案");
  }

  const steps = [
    "打开 TikTok Shop 卖家中心 → 商品 → 添加新商品",
    "上传主图:把下方主图下载后作为商品图片上传(首图建议白底高清)",
    `填写标题与五点卖点:复制下方文案粘贴(${regionCn}用${lang},已按目标市场生成)`,
    "设置价格、库存与运费模板",
    "关联视频:成片下载后上传到你的 TikTok 账号,在商品 / 橱窗挂载带货",
    `核对合规:${regionNote(region)}`,
    "提交审核,通过后即上架",
  ];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white/95 px-5 py-3.5 backdrop-blur">
          <div className="min-w-0">
            <div className="text-2xs font-medium text-zinc-400">发布助手 · 出海包</div>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-ink">
              {kit?.product.title ?? "加载中…"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-6 p-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}
          {error && !loading && (
            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          {kit && !loading && (
            <>
              {/* 成片 */}
              <Section icon={Clapperboard} title={`成片 (${kit.videos.length})`}>
                {kit.videos.length > 0 ? (
                  <div className="space-y-2">
                    {kit.videos.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2"
                      >
                        <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-zinc-100">
                          {v.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 truncate text-sm text-zinc-700">{v.title}</div>
                        {v.videoUrl && (
                          <a
                            href={v.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={`${v.title}.mp4`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-2xs font-medium text-emerald-700 hover:bg-emerald-100"
                          >
                            <Download className="h-3 w-3" /> 下载
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyHint href={`/app/create?agent=DIRECTOR&productId=${productId}`} label="还没出片 · 为它做视频" />
                )}
              </Section>

              {/* 主图 */}
              <Section icon={Images} title="主图">
                {listing?.images?.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {listing.images.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        title="点击查看 / 右键保存"
                        className="group relative aspect-square overflow-hidden rounded-lg border border-black/10"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`主图 ${i + 1}`}
                          className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                        />
                        <span className="absolute bottom-1 right-1 rounded-full bg-black/60 p-1 text-white">
                          <Download className="h-3 w-3" />
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyHint
                    href={`/app/create?agent=LISTING&productId=${productId}`}
                    label="还没出主图 · 为它做 Listing"
                  />
                )}
              </Section>

              {/* 文案 */}
              <Section
                icon={ListChecks}
                title="文案"
                action={
                  listing ? (
                    <button
                      onClick={copyAll}
                      className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-2xs font-medium text-zinc-600 hover:text-ink"
                    >
                      <Copy className="h-2.5 w-2.5" /> 复制全部
                    </button>
                  ) : undefined
                }
              >
                {listing ? (
                  <div className="space-y-2.5 text-sm">
                    <Field label="标题" onCopy={() => copy(listing.title, "标题")}>
                      <div className="leading-relaxed text-ink">{listing.title}</div>
                    </Field>
                    {listing.sellingPoints?.length > 0 && (
                      <Field label="五点卖点" onCopy={() => copy(listing.sellingPoints.join("\n"), "五点卖点")}>
                        <ol className="space-y-1">
                          {listing.sellingPoints.map((p, i) => (
                            <li key={i} className="flex gap-2 leading-relaxed text-zinc-800">
                              <span className="shrink-0 font-mono text-2xs leading-5 text-zinc-400">{i + 1}.</span>
                              {p}
                            </li>
                          ))}
                        </ol>
                      </Field>
                    )}
                    {listing.hashtags?.length > 0 && (
                      <Field label="标签" onCopy={() => copy(listing.hashtags.join(" "), "标签")}>
                        <div className="flex flex-wrap gap-1.5">
                          {listing.hashtags.map((t, i) => (
                            <span key={i} className="rounded-full bg-zinc-100 px-2 py-0.5 text-2xs text-zinc-600">
                              {t}
                            </span>
                          ))}
                        </div>
                      </Field>
                    )}
                  </div>
                ) : (
                  <EmptyHint
                    href={`/app/create?agent=LISTING&productId=${productId}`}
                    label="还没做 Listing · 去生成文案"
                  />
                )}
              </Section>

              {/* 发布清单 */}
              <Section icon={Globe} title="发布清单">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-2xs text-zinc-400">目标市场</span>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value as Region)}
                    className="h-7 rounded-full border border-black/10 bg-white pl-2 pr-1 text-2xs font-medium text-zinc-700 outline-none hover:border-zinc-300 focus:border-brand-400"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.flag} {r.cn} · {r.lang}
                      </option>
                    ))}
                  </select>
                </div>
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-zinc-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-2xs font-semibold text-zinc-500">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-2xs text-zinc-400">
                  OneClaw 负责把内容做好;实际发布在 TikTok Shop 手动完成,照上面逐项核对即可。
                </p>
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-700">
          <Icon className="h-3 w-3" /> {title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  onCopy,
  children,
}: {
  label: string;
  onCopy: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-2xs font-medium text-zinc-400">{label}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-2xs font-medium text-zinc-500 hover:text-ink"
        >
          <Copy className="h-2.5 w-2.5" /> 复制
        </button>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-500 hover:border-brand-200 hover:text-brand-700"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}
