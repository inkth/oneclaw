"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles,
  Wand2,
  Loader2,
  Package,
  UserSquare2,
  Image as ImageIcon,
  Check,
  X,
  AlertTriangle,
  Crown,
  Star,
  Bookmark,
  Trash2,
  Library,
  Link2,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import { TemplateOptimizerModal } from "@/components/TemplateOptimizerModal";
import { Popover, ToolbarButton } from "@/components/ui/Popover";

type AspectRatio = "9:16" | "16:9" | "1:1";
type VideoStyle = "UNBOXING" | "COMPARISON" | "SCENE" | "BEFORE_AFTER";

type Engine = {
  key: string;
  cn: string;
  tagline: string;
  durations: number[];
  aspects: AspectRatio[];
  tags: string[];
  recommended: boolean;
  supportsImageInput: boolean;
  requiresImage: boolean;
  priceHint: string;
};

type Product = {
  id: string;
  title: string;
  emoji: string | null;
  priceCents: number;
  roiScore: number;
  status: string;
};

type Material = { id: string; type: string; url: string; originalName: string };

type ModelAsset = {
  id: string;
  name: string;
  gender: string;
  style: string | null;
  avatarUrl: string | null;
  usageCount: number;
  isFavorite: boolean;
};

const STYLES: Array<{ v: VideoStyle; cn: string; emoji: string }> = [
  { v: "UNBOXING", cn: "开箱", emoji: "📦" },
  { v: "COMPARISON", cn: "对比", emoji: "⚖️" },
  { v: "SCENE", cn: "场景", emoji: "🌿" },
  { v: "BEFORE_AFTER", cn: "Before/After", emoji: "✨" },
];

type Template = {
  id: string;
  kind: "starter" | "custom";
  emoji: string;
  name: string;
  description: string;
  engine: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: VideoStyle;
  promptTemplate: string;
  defaultProductId: string | null;
  defaultModelAssetId: string | null;
  defaultMaterialIds: string[];
  generateScript: boolean;
  generateCover: boolean;
  isFavorite: boolean;
  usageCount: number;
};

const DRAFT_KEY = "oneclaw:create-draft";

export function CreateClient({
  workspaceId,
  falReady,
  engines,
  products,
  materials,
  models,
  starterTemplates,
  customTemplates,
  isGuest = false,
}: {
  workspaceId: string;
  falReady: boolean;
  engines: Engine[];
  products: Product[];
  materials: Material[];
  models: ModelAsset[];
  starterTemplates: Template[];
  customTemplates: Template[];
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [engineKey, setEngineKey] = useState<string>(
    engines.find((e) => e.recommended)?.key ?? engines[0]?.key ?? "",
  );
  const engine = useMemo(
    () => engines.find((e) => e.key === engineKey) ?? engines[0]!,
    [engineKey, engines],
  );

  const [duration, setDuration] = useState<number>(engine?.durations[0] ?? 5);
  const [aspect, setAspect] = useState<AspectRatio>(
    (engine?.aspects[0] as AspectRatio) ?? "9:16",
  );
  const [style, setStyle] = useState<VideoStyle>("SCENE");
  const [productId, setProductId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [generateScript, setGenerateScript] = useState(false);
  const [generateCover, setGenerateCover] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  // 贴链接一键出片
  const [linkUrl, setLinkUrl] = useState("");
  const [parsingLink, setParsingLink] = useState(false);
  const [linkPreview, setLinkPreview] = useState<{
    title: string;
    emoji: string;
    sellingPoints: string[];
    ogImage: string | null;
  } | null>(null);

  const [optimizerOpen, setOptimizerOpen] = useState(false);

  // 游客登录引导
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  // Template state
  const [customs, setCustoms] = useState<Template[]>(customTemplates);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const allTemplates = useMemo(
    () =>
      [...customs, ...starterTemplates].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "custom" ? -1 : 1;
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return b.usageCount - a.usageCount;
      }),
    [customs, starterTemplates],
  );

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const selectedModel = models.find((m) => m.id === modelId) ?? null;

  // 把当前已填内容存到本地，登录回来后恢复，避免游客重填
  function saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ engineKey, duration, aspect, style, prompt, title, generateScript, generateCover }),
      );
    } catch {}
  }

  // 游客触发需要账号的动作时：先存草稿，再弹登录引导。返回 true 表示已拦截。
  function gateGuest(): boolean {
    if (!isGuest) return false;
    saveDraft();
    setLoginPromptOpen(true);
    return true;
  }

  // 登录回来（已是登录态）后恢复草稿，只在挂载时跑一次
  useEffect(() => {
    if (isGuest) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      localStorage.removeItem(DRAFT_KEY);
      const d = JSON.parse(raw);
      if (d.engineKey && engines.some((e) => e.key === d.engineKey)) setEngineKey(d.engineKey);
      if (typeof d.duration === "number") setDuration(d.duration);
      if (d.aspect) setAspect(d.aspect);
      if (d.style) setStyle(d.style);
      if (typeof d.prompt === "string") setPrompt(d.prompt);
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.generateScript === "boolean") setGenerateScript(d.generateScript);
      if (typeof d.generateCover === "boolean") setGenerateCover(d.generateCover);
      if (d.prompt) toast.success("已恢复你登录前填写的内容");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(t: Template) {
    setAppliedTemplateId(t.id);
    setEngineKey(t.engine);
    setDuration(t.durationSec);
    setAspect(t.aspectRatio);
    setStyle(t.style);
    setPrompt(t.promptTemplate);
    setGenerateScript(t.generateScript);
    setGenerateCover(t.generateCover);
    if (t.defaultProductId) setProductId(t.defaultProductId);
    if (t.defaultModelAssetId) setModelId(t.defaultModelAssetId);
    if (t.defaultMaterialIds.length > 0) setMaterialIds(t.defaultMaterialIds);
    if (t.kind === "custom") {
      // 增加 usageCount（不阻塞）
      fetch(`/api/workspaces/${workspaceId}/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bumpUsage: true }),
      }).catch(() => {});
      setCustoms((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, usageCount: x.usageCount + 1 } : x)),
      );
    }
    toast.success(`已套用模板：${t.name}`);
  }

  async function toggleStarTemplate(t: Template) {
    if (t.kind !== "custom") {
      toast.message("起步模板不能收藏，另存为自己的模板再收藏");
      return;
    }
    const next = !t.isFavorite;
    setCustoms((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, isFavorite: next } : x)),
    );
    const res = await fetch(`/api/workspaces/${workspaceId}/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: next }),
    });
    if (!res.ok) {
      setCustoms((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, isFavorite: !next } : x)),
      );
      toast.error("收藏失败");
    }
  }

  async function deleteTemplate(t: Template) {
    if (t.kind !== "custom") return;
    if (!confirm(`删除模板「${t.name}」？`)) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/templates/${t.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCustoms((prev) => prev.filter((x) => x.id !== t.id));
      toast.success("已删除");
    } else {
      toast.error("删除失败");
    }
  }

  async function saveAsTemplate(name: string, description: string, emoji: string) {
    if (!prompt.trim()) {
      toast.error("先写完 prompt 再保存");
      return false;
    }
    const res = await fetch(`/api/workspaces/${workspaceId}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        emoji,
        engine: engine.key,
        durationSec: duration,
        aspectRatio: aspect,
        style,
        promptTemplate: prompt.trim(),
        defaultProductId: productId ?? undefined,
        defaultModelAssetId: modelId ?? undefined,
        defaultMaterialIds: materialIds,
        generateScript,
        generateCover,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || "保存失败");
      return false;
    }
    const t: Template = {
      id: json.data.template.id,
      kind: "custom",
      emoji,
      name,
      description,
      engine: engine.key,
      durationSec: duration,
      aspectRatio: aspect,
      style,
      promptTemplate: prompt.trim(),
      defaultProductId: productId,
      defaultModelAssetId: modelId,
      defaultMaterialIds: materialIds,
      generateScript,
      generateCover,
      isFavorite: false,
      usageCount: 0,
    };
    setCustoms((prev) => [t, ...prev]);
    setAppliedTemplateId(t.id);
    toast.success(`已保存：${name}`);
    return true;
  }

  // 切引擎时把不兼容的 duration/aspect 修正
  useEffect(() => {
    if (!engine.durations.includes(duration)) {
      setDuration(engine.durations[0]!);
    }
    if (!engine.aspects.includes(aspect)) {
      setAspect(engine.aspects[0]!);
    }
  }, [engine, duration, aspect]);

  // 选商品时自动用商品标题填一段默认 prompt
  function pickProduct(p: Product) {
    setProductId(productId === p.id ? null : p.id);
    if (!prompt.trim() && productId !== p.id) {
      setPrompt(
        `${p.title}，${STYLES.find((s) => s.v === style)?.cn} 风格，9:16 竖屏，干净有质感的产品镜头，强光感。`,
      );
    }
  }

  function toggleMaterial(id: string) {
    setMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 6),
    );
  }

  async function parseLink() {
    const url = linkUrl.trim();
    if (!url) {
      toast.error("先贴一个商品链接");
      return;
    }
    // 识别链接对游客开放（只有「生成视频」才需要登录）
    setParsingLink(true);
    try {
      const res = await fetch(`/api/creation/from-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error?.message || "解析失败，换个链接或手动填");
        return;
      }
      const { parsed, ogImage } = json.data as {
        parsed: {
          title: string;
          emoji: string;
          sellingPoints: string[];
          suggestedStyle: VideoStyle;
          suggestedEngine: string;
          suggestedPrompt: string;
          videoTitle: string;
        };
        ogImage: string | null;
      };

      // 预填创作向导
      setStyle(parsed.suggestedStyle);
      if (engines.some((e) => e.key === parsed.suggestedEngine)) {
        setEngineKey(parsed.suggestedEngine);
      }
      setPrompt(parsed.suggestedPrompt);
      setTitle(parsed.videoTitle || parsed.title);
      setGenerateScript(true);
      setGenerateCover(true);
      setAppliedTemplateId(null);
      setLinkPreview({
        title: parsed.title,
        emoji: parsed.emoji,
        sellingPoints: parsed.sellingPoints,
        ogImage,
      });
      toast.success(`已识别：${parsed.emoji} ${parsed.title}，提示词已填好，可微调后生成`);
    } catch {
      toast.error("网络异常，稍后再试");
    } finally {
      setParsingLink(false);
    }
  }

  async function submit() {
    if (!prompt.trim()) {
      toast.error("先写一句提示词");
      return;
    }
    if (gateGuest()) return;
    setSubmitting(true);
    const res = await fetch(`/api/workspaces/${workspaceId}/videos/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: engine.key,
        prompt: prompt.trim(),
        title: title.trim() || undefined,
        style,
        durationSec: duration,
        aspectRatio: aspect,
        productId: productId ?? undefined,
        modelAssetId: modelId ?? undefined,
        templateId: appliedTemplateId ?? undefined,
        referenceMaterialIds: materialIds,
        generateScript,
        generateCover,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      toast.error(json?.error?.message || "提交失败");
      return;
    }
    toast.success("已提交，等待 fal 出片", {
      action: { label: "去看成片", onClick: () => router.push("/app/videos") },
    });
    setPrompt("");
  }

  const canSubmit = !!prompt.trim() && !submitting && (falReady || isGuest);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">创作工坊</h1>
        <p className="mt-1 text-sm text-zinc-500">
          写一句提示词，让 AI 帮你做带货短视频。商品、素材、模板、引擎参数都收在输入框下方。
        </p>
      </div>

      {!falReady && !isGuest && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <div className="font-semibold">FAL_KEY 未配置</div>
            <p className="mt-0.5">提交后会立刻失败。请先在 .env.local 填上 fal.ai 凭证。</p>
          </div>
        </div>
      )}

      {/* 链接识别结果（识别后浮现在 composer 上方） */}
      {linkPreview && (
        <div className="flex items-start gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-3">
          {linkPreview.ogImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={linkPreview.ogImage}
              alt=""
              className="h-14 w-14 rounded-lg object-cover flex-shrink-0 bg-zinc-100"
            />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-white flex items-center justify-center text-2xl flex-shrink-0">
              {linkPreview.emoji}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">
              {linkPreview.emoji} {linkPreview.title}
            </div>
            {linkPreview.sellingPoints.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {linkPreview.sellingPoints.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex rounded-full bg-white px-1.5 py-0.5 text-2xs text-indigo-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1 text-2xs text-zinc-400">
              提示词与标题已填入下方，可微调后点「生成视频」。
            </p>
          </div>
          <button
            onClick={() => setLinkPreview(null)}
            className="rounded-full p-1 text-zinc-400 hover:bg-white hover:text-zinc-600"
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* === 核心：创作 composer === */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="视频标题（可选，默认取提示词前 60 字）"
          className="w-full rounded-t-2xl border-b border-zinc-100 bg-transparent px-4 py-2.5 text-sm font-medium outline-none placeholder:font-normal placeholder:text-zinc-400"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="例：USB 充电便携榨汁杯，9:16 竖屏，金色 hour 户外公园场景，年轻女生倒入草莓和牛奶按下开关，特写气泡上涌，3 秒打通…"
          className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
        />

        {/* 工具栏：配置都收在这一排并列按钮里 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-3 py-2.5">
          {/* 贴链接 */}
          <Popover
            align="start"
            panelClassName="w-80"
            trigger={({ open }) => (
              <ToolbarButton icon={Link2} label="贴链接" open={open} />
            )}
          >
            {({ close }) => (
              <div className="space-y-2">
                <div className="text-2xs text-zinc-500">
                  贴 TikTok Shop / 亚马逊 / 独立站商品页，自动识别 + 写好提示词
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !parsingLink) {
                        parseLink().then(() => close());
                      }
                    }}
                    placeholder="粘贴商品页链接…"
                    autoFocus
                    className="flex-1 rounded-lg border border-zinc-200/80 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                  />
                  <button
                    onClick={() => parseLink().then(() => close())}
                    disabled={parsingLink || !linkUrl.trim()}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    {parsingLink ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" />
                    )}
                    识别
                  </button>
                </div>
              </div>
            )}
          </Popover>

          {/* 模板库 */}
          <Popover
            align="start"
            panelClassName="w-[22rem]"
            trigger={({ open }) => (
              <ToolbarButton icon={Library} label="模板" open={open} active={!!appliedTemplateId} />
            )}
          >
            {({ close }) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-zinc-500">
                    {customs.length} 自定义 · {starterTemplates.length} 起步 · 点击套用
                  </span>
                  <button
                    onClick={() => {
                      close();
                      if (gateGuest()) return;
                      setOptimizerOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-2xs font-medium text-white hover:bg-indigo-700"
                    title="基于历史使用 + 视频成绩，AI 推荐高效模板"
                  >
                    <Sparkles className="h-3 w-3" />
                    AI 推荐
                  </button>
                </div>
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
                  {allTemplates.map((t) => {
                    const applied = appliedTemplateId === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`relative rounded-xl border p-2.5 cursor-pointer transition-all ${
                          applied
                            ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/30"
                            : "border-zinc-200/80 bg-zinc-50/40 hover:border-zinc-300 hover:bg-white"
                        }`}
                        onClick={() => {
                          applyTemplate(t);
                          close();
                        }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="text-lg leading-none">{t.emoji}</div>
                          <div className="flex items-center gap-0.5">
                            {t.kind === "starter" ? (
                              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-2xs text-zinc-500">
                                官方
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleStarTemplate(t);
                                  }}
                                  className="p-0.5 rounded hover:bg-zinc-200"
                                  title={t.isFavorite ? "取消收藏" : "收藏"}
                                >
                                  <Star
                                    className={`h-3 w-3 ${
                                      t.isFavorite ? "fill-amber-400 text-amber-400" : "text-zinc-300"
                                    }`}
                                  />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteTemplate(t);
                                  }}
                                  className="p-0.5 rounded hover:bg-rose-50 text-zinc-300 hover:text-rose-600"
                                  title="删除"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5 text-xs font-medium truncate">{t.name}</div>
                        <p className="mt-0.5 text-2xs text-zinc-500 line-clamp-2 min-h-[1.6em]">
                          {t.description || t.promptTemplate}
                        </p>
                        <div className="mt-2 flex items-center gap-1 text-2xs text-zinc-400">
                          <span className="rounded bg-zinc-100 px-1 py-px font-mono">
                            {engines.find((e) => e.key === t.engine)?.cn ?? t.engine}
                          </span>
                          <span>{t.durationSec}s</span>
                          {t.usageCount > 0 && (
                            <span className="ml-auto text-zinc-300">×{t.usageCount}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Popover>

          {/* 商品 */}
          <Popover
            align="start"
            panelClassName="w-72"
            trigger={({ open }) => (
              <ToolbarButton icon={Package} label="商品" open={open} active={!!productId} />
            )}
          >
            {() =>
              products.length === 0 ? (
                <EmptyPickerHint href="/app/assets/products" label="去选品库" />
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pickProduct(p)}
                      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-left transition-colors ${
                        productId === p.id
                          ? "bg-indigo-50 ring-1 ring-indigo-200"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <span className="text-base">{p.emoji ?? "📦"}</span>
                      <span className="flex-1 truncate">{p.title}</span>
                      <span className="text-2xs text-zinc-400 font-mono">R{p.roiScore}</span>
                      {productId === p.id && <Check className="h-3 w-3 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )
            }
          </Popover>

          {/* 参考素材 */}
          <Popover
            align="start"
            panelClassName="w-72"
            trigger={({ open }) => (
              <ToolbarButton
                icon={ImageIcon}
                label="素材"
                open={open}
                active={materialIds.length > 0}
                badge={materialIds.length || undefined}
              />
            )}
          >
            {() => (
              <div className="space-y-2">
                <div className="text-2xs text-zinc-400">
                  {engine.supportsImageInput ? "✨ 首张图作为视频首帧" : "最多 6 个"}
                </div>
                {engine.requiresImage && materialIds.length === 0 && (
                  <div className="rounded-md bg-amber-50 px-2 py-1.5 text-2xs text-amber-800 border border-amber-200/80">
                    ⚠️ {engine.cn} 必须选一张图，否则无法提交
                  </div>
                )}
                {materials.length === 0 ? (
                  <EmptyPickerHint href="/app/assets/materials" label="去素材库" />
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
                    {materials.map((m) => {
                      const sel = materialIds.includes(m.id);
                      const isI2vFirstFrame =
                        engine.supportsImageInput &&
                        sel &&
                        m.type === "IMAGE" &&
                        materials
                          .filter((mm) => materialIds.includes(mm.id) && mm.type === "IMAGE")
                          .findIndex((mm) => mm.id === m.id) === 0;
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleMaterial(m.id)}
                          className={`relative aspect-square rounded-md overflow-hidden border ${
                            sel ? "border-indigo-500 ring-2 ring-indigo-200" : "border-zinc-200/80"
                          }`}
                          title={m.originalName}
                        >
                          {m.type === "IMAGE" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <video src={m.url} className="h-full w-full object-cover" muted />
                          )}
                          {isI2vFirstFrame && (
                            <span className="absolute left-0.5 top-0.5 rounded bg-sky-500 px-1 py-px text-2xs font-medium text-white">
                              首帧
                            </span>
                          )}
                          {sel && (
                            <div className="absolute inset-0 bg-indigo-500/40 flex items-center justify-center">
                              <Check className="h-4 w-4 text-white" strokeWidth={3} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Popover>

          {/* 模特 / 人设 */}
          <Popover
            align="start"
            panelClassName="w-72"
            trigger={({ open }) => (
              <ToolbarButton icon={UserSquare2} label="模特" open={open} active={!!modelId} />
            )}
          >
            {() =>
              models.length === 0 ? (
                <EmptyPickerHint href="/app/assets/models" label="去模特库" />
              ) : (
                <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
                  {models.map((m) => {
                    const sel = modelId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setModelId(sel ? null : m.id)}
                        className={`relative aspect-[3/4] rounded-md overflow-hidden border bg-zinc-100 flex items-center justify-center ${
                          sel ? "border-indigo-500 ring-2 ring-indigo-200" : "border-zinc-200/80"
                        }`}
                        title={m.name}
                      >
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <UserSquare2 className="h-5 w-5 text-zinc-400" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-2xs py-0.5 truncate px-1 text-center">
                          {m.name}
                        </div>
                        {m.isFavorite && (
                          <Star className="absolute right-1 top-1 h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        )}
                        {sel && (
                          <div className="absolute inset-0 bg-indigo-500/30 flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            }
          </Popover>

          {/* 引擎 / 参数 / 输出选项 */}
          <Popover
            align="start"
            panelClassName="w-[24rem]"
            trigger={({ open }) => (
              <ToolbarButton icon={SlidersHorizontal} label="设置" open={open} />
            )}
          >
            {() => (
              <div className="max-h-[28rem] space-y-4 overflow-y-auto">
                <div>
                  <div className="mb-1.5 text-2xs font-medium text-zinc-500 uppercase tracking-wider">
                    视频引擎
                  </div>
                  <div className="space-y-1.5">
                    {engines.map((e) => {
                      const active = engineKey === e.key;
                      return (
                        <button
                          key={e.key}
                          onClick={() => setEngineKey(e.key)}
                          className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                            active
                              ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/40"
                              : "border-zinc-200/80 bg-white hover:border-zinc-300"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold truncate">{e.cn}</span>
                            <div className="flex items-center gap-1">
                              {e.supportsImageInput && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-2xs font-medium text-sky-700">
                                  <ImageIcon className="h-2.5 w-2.5" />
                                  i2v
                                </span>
                              )}
                              {e.recommended && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-2xs font-medium text-amber-700">
                                  <Crown className="h-2.5 w-2.5" />
                                  推荐
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-2xs text-zinc-500 line-clamp-1">{e.tagline}</p>
                          <div className="mt-1 text-2xs text-zinc-400 font-mono">{e.priceHint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="mb-1.5 text-2xs font-medium text-zinc-500 uppercase tracking-wider">
                      风格
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {STYLES.map((s) => (
                        <button
                          key={s.v}
                          onClick={() => setStyle(s.v)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                            style === s.v
                              ? "border-indigo-500 bg-indigo-50/40 text-indigo-700 font-medium"
                              : "border-zinc-200/80 hover:border-zinc-300"
                          }`}
                        >
                          {s.emoji} {s.cn}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1.5 text-2xs font-medium text-zinc-500 uppercase tracking-wider">
                        时长
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {engine.durations.map((d) => (
                          <button
                            key={d}
                            onClick={() => setDuration(d)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                              duration === d
                                ? "border-indigo-500 bg-indigo-50/40 text-indigo-700 font-medium"
                                : "border-zinc-200/80 hover:border-zinc-300"
                            }`}
                          >
                            {d}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 text-2xs font-medium text-zinc-500 uppercase tracking-wider">
                        比例
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {engine.aspects.map((a) => (
                          <button
                            key={a}
                            onClick={() => setAspect(a as AspectRatio)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                              aspect === a
                                ? "border-indigo-500 bg-indigo-50/40 text-indigo-700 font-medium"
                                : "border-zinc-200/80 hover:border-zinc-300"
                            }`}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-100 pt-3">
                  <div className="mb-1.5 text-2xs font-medium text-zinc-500 uppercase tracking-wider">
                    输出选项
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={generateScript}
                        onChange={(e) => setGenerateScript(e.target.checked)}
                        className="rounded"
                      />
                      <Sparkles className="h-3 w-3 text-indigo-500" />
                      AI 写脚本
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={generateCover}
                        onChange={(e) => setGenerateCover(e.target.checked)}
                        className="rounded"
                      />
                      <ImageIcon className="h-3 w-3 text-violet-500" />
                      生成封面
                    </label>
                  </div>
                </div>
              </div>
            )}
          </Popover>

          {/* 右侧：字数 + 存模板 + 生成 */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-2xs text-zinc-400 font-mono">{prompt.length}/2000</span>
            <button
              onClick={() => {
                if (gateGuest()) return;
                setSaveOpen(true);
              }}
              disabled={!prompt.trim()}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              title="把当前组合保存为模板"
            >
              <Bookmark className="h-3.5 w-3.5" />
              存为模板
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              生成视频
            </button>
          </div>
        </div>
      </div>

      {/* 当前配置概览 */}
      <div className="px-1 text-2xs text-zinc-500">
        <span className="font-medium text-zinc-700">{engine.cn}</span>
        {" · "}
        {duration}s · {aspect} · {STYLES.find((s) => s.v === style)?.cn}
        {selectedProduct && (
          <>
            {" · "}
            <span className="text-indigo-600">{selectedProduct.emoji ?? "📦"} {selectedProduct.title}</span>
          </>
        )}
        {selectedModel && (
          <>
            {" · "}
            <span className="text-zinc-700">模特 {selectedModel.name}</span>
          </>
        )}
        {materialIds.length > 0 && (
          <>
            {" · "}
            <span className="text-emerald-600">+{materialIds.length} 素材</span>
          </>
        )}
        {generateScript && <span className="text-indigo-500"> · AI 脚本</span>}
        {generateCover && <span className="text-violet-500"> · 封面</span>}
      </div>

      {saveOpen && (
        <SaveTemplateModal
          defaultEmoji="🎬"
          defaultName={title || prompt.slice(0, 30)}
          onClose={() => setSaveOpen(false)}
          onSave={async (name, desc, emoji) => {
            const ok = await saveAsTemplate(name, desc, emoji);
            if (ok) setSaveOpen(false);
          }}
        />
      )}

      {loginPromptOpen && (
        <LoginPromptModal onClose={() => setLoginPromptOpen(false)} />
      )}

      {optimizerOpen && (
        <TemplateOptimizerModal
          workspaceId={workspaceId}
          templates={customs.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
          onClose={() => setOptimizerOpen(false)}
          onTemplateCreated={() => {
            // 刷新一次（让 server 重新查 customTemplates）
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EmptyPickerHint({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block text-center rounded-lg border border-dashed border-zinc-300 py-6 text-xs text-zinc-500 hover:bg-white hover:text-indigo-600"
    >
      还没有，{label} →
    </Link>
  );
}

function LoginPromptModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-white shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="p-6 space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">登录后继续</h2>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
              你刚才填写的内容已经帮你保存好了，登录回来会自动恢复，不用重填。
            </p>
          </div>
          <Link
            href="/login?callbackUrl=/app/create"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            登录 / 注册
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={onClose}
            className="w-full text-xs text-zinc-400 hover:text-zinc-600"
          >
            再逛逛
          </button>
        </div>
      </div>
    </div>
  );
}

const EMOJI_PICK = ["🎬", "📦", "✨", "🐶", "🌀", "🎤", "⚖️", "🔥", "💡", "🛍️", "🎯"];

function SaveTemplateModal({
  defaultName,
  defaultEmoji,
  onClose,
  onSave,
}: {
  defaultName: string;
  defaultEmoji: string;
  onClose: () => void;
  onSave: (name: string, description: string, emoji: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName.slice(0, 60));
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState(defaultEmoji);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    await onSave(name.trim(), description.trim(), emoji);
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">存为模板</h2>
          <p className="-mt-2 text-xs text-zinc-500">
            把当前的「引擎 / 风格 / prompt / 默认素材」组合保存下来，下次一键套用。
          </p>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">图标</label>
            <div className="flex flex-wrap gap-1">
              {EMOJI_PICK.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`h-9 w-9 rounded-lg text-lg transition-all ${
                    emoji === e
                      ? "bg-indigo-100 ring-2 ring-indigo-300"
                      : "bg-zinc-50 hover:bg-zinc-100"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="例：3C 数码 9:16 开箱模板"
              className="w-full rounded-lg border border-zinc-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              备注（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={800}
              rows={2}
              placeholder="什么时候用、有什么诀窍…"
              className="w-full rounded-lg border border-zinc-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
            />
          </div>

          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
