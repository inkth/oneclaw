"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  Image as ImageIcon,
  Video,
  Music,
  Trash2,
  Tag,
  Wand2,
  Check,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { apiBrowser } from "@/lib/api-browser";
import { CREDIT_COST } from "@/lib/credits";

// 每张图做成商品 = 出 4 张展示图(白底/场景/细节/俯拍),纯出图、不含文案。
const SHOTS_PER_PRODUCT = 4;
const PER_IMAGE_CREDITS = CREDIT_COST.image * SHOTS_PER_PRODUCT;

type MaterialType = "IMAGE" | "VIDEO" | "AUDIO" | "LOGO" | "WATERMARK" | "FONT";

type Material = {
  id: string;
  type: MaterialType;
  originalName: string;
  url: string;
  contentType: string | null;
  sizeBytes: number;
  tags: string[];
  createdAt: string;
};

const typeMeta: Record<MaterialType, { cn: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  IMAGE: { cn: "图片", icon: ImageIcon, tone: "bg-brand-50 text-brand-700" },
  VIDEO: { cn: "视频", icon: Video, tone: "bg-violet-50 text-violet-700" },
  AUDIO: { cn: "音频", icon: Music, tone: "bg-emerald-50 text-emerald-700" },
  LOGO: { cn: "Logo", icon: ImageIcon, tone: "bg-amber-50 text-amber-700" },
  WATERMARK: { cn: "水印", icon: ImageIcon, tone: "bg-fuchsia-50 text-fuchsia-700" },
  FONT: { cn: "字体", icon: Tag, tone: "bg-zinc-100 text-zinc-700" },
};

const filters: Array<{ key: "ALL" | MaterialType; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "IMAGE", label: "图片" },
  { key: "VIDEO", label: "视频" },
  { key: "AUDIO", label: "音频" },
];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MaterialsClient({
  workspaceId,
  storageReady,
  initialMaterials,
  isGuest = false,
}: {
  workspaceId: string;
  storageReady: boolean;
  initialMaterials: Material[];
  isGuest?: boolean;
}) {
  const router = useRouter();
  const { open: openAuthModal } = useAuthModal();

  function gateGuest(): boolean {
    if (!isGuest) return false;
    openAuthModal({
      title: "登录后即可上传素材",
      desc: "素材库需要账号，登录后上传的图片、视频会保存在工作台。",
    });
    return true;
  }
  const [materials, setMaterials] = useState(initialMaterials);
  const [filter, setFilter] = useState<"ALL" | MaterialType>("ALL");
  const [uploading, setUploading] = useState<string[]>([]); // 文件名列表，UI 显示 progress
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const visible =
    filter === "ALL" ? materials : materials.filter((m) => m.type === filter);

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 「把商品图变成商品」:每张图建一张商品卡 + 据原图出 4 张展示图(白底/场景/细节/俯拍)。
  // 纯出图、不写文案(文案进商品详情页按需生成)。单图(卡片)与多选(底栏)走同一链路。
  async function submitBatch(ids: string[]) {
    if (gateGuest()) return;
    if (ids.length === 0) return;
    const noun = ids.length === 1 ? "这张图" : `${ids.length} 张图`;
    if (
      !confirm(
        `将为${noun}各做成一个商品,并据原图生成 ${SHOTS_PER_PRODUCT} 张商品展示图(白底/场景/细节/俯拍)。\n` +
          `预计消耗约 ${ids.length * PER_IMAGE_CREDITS} 积分。继续?`,
      )
    )
      return;
    setBatchBusy(true);
    try {
      await apiBrowser(`/workspaces/${workspaceId}/product-batches`, {
        method: "POST",
        body: JSON.stringify({ materialIds: ids }),
      });
      toast.success(`已创建 ${ids.length} 个商品,正在生成展示图…`);
      exitSelect();
      router.push("/app/assets/products"); // 去「资产 · 我的商品」看卡片「出图中 → 已出图」自填充
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setBatchBusy(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (gateGuest()) return;
    if (!storageReady) {
      toast.error("上传暂不可用，请稍后再试");
      return;
    }
    const arr = Array.from(files);
    setUploading((prev) => [...prev, ...arr.map((f) => f.name)]);

    for (const file of arr) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials`, {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          setMaterials((prev) => [json.data.material, ...prev]);
          toast.success(`上传成功：${file.name}`);
        } else {
          toast.error(`${file.name}：${json?.error?.message ?? "上传失败"}`);
        }
      } catch (e) {
        toast.error(`${file.name}：${e instanceof Error ? e.message : "网络错误"}`);
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name));
      }
    }
    router.refresh();
  }


  async function deleteMaterial(id: string) {
    if (!confirm("确定删除该素材？")) return;
    const res = await fetch(`/api/v1/workspaces/${workspaceId}/materials/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      toast.success("已删除");
      router.refresh();
    } else {
      toast.error("删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="素材库"
        description={
          <>
            上传你自己的图片 / 视频 / 音频，发现猫 会在视频生成时优先用作底料。
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectMode
                ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                : "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
            }`}
            title="多选商品图,批量生成商品卡 + Listing"
          >
            {selectMode ? <X className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
            {selectMode ? "退出多选" : "批量做商品"}
          </button>
          <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full p-0.5 self-start">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {f.label}
                <span className="ml-1 text-2xs text-zinc-400">
                  {f.key === "ALL"
                    ? materials.length
                    : materials.filter((m) => m.type === f.key).length}
                </span>
              </button>
            ))}
          </div>
          </div>
        }
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-brand-300 bg-brand-50/40"
            : "border-zinc-300 bg-white hover:border-zinc-400"
        }`}
      >
        <Upload className="mx-auto h-6 w-6 text-zinc-400" />
        <div className="mt-2 text-sm font-medium text-zinc-900">
          点击或拖拽上传
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          支持图片 / 视频 / 音频，单文件 ≤ 50MB
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploading.length > 0 && (
        <div className="rounded-xl bg-brand-50/60 border border-brand-100 p-3 space-y-1">
          {uploading.map((name) => (
            <div key={name} className="flex items-center gap-2 text-xs text-brand-900">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={
            filter === "ALL"
              ? "还没上传素材，拖一个文件到上方区域开始。"
              : "这个分类下还没有素材"
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visible.map((m) => {
            const tm = typeMeta[m.type];
            const Icon = tm.icon;
            const selectable = m.type === "IMAGE"; // 只有商品图能「做商品」(后端也只认 IMAGE)
            const isSel = selected.has(m.id);
            const picking = selectMode && selectable;
            return (
              <div
                key={m.id}
                onClick={picking ? () => toggleSelect(m.id) : undefined}
                className={`group relative rounded-xl border bg-white overflow-hidden transition ${
                  picking ? "cursor-pointer" : ""
                } ${
                  isSel
                    ? "border-brand-500 ring-2 ring-brand-500/40"
                    : "border-zinc-200/80"
                } ${selectMode && !selectable ? "opacity-40" : ""}`}
              >
                <div className="aspect-square bg-zinc-50 flex items-center justify-center relative">
                  {picking && (
                    <span
                      className={`absolute right-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
                        isSel
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-white bg-black/30 text-transparent"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  {m.type === "IMAGE" || m.type === "LOGO" || m.type === "WATERMARK" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.originalName} className="absolute inset-0 h-full w-full object-cover" />
                  ) : m.type === "VIDEO" ? (
                    <video src={m.url} className="absolute inset-0 h-full w-full object-cover" muted preload="metadata" />
                  ) : (
                    <Icon className="h-8 w-8 text-zinc-400" />
                  )}
                  <span className={`absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium ${tm.tone}`}>
                    <Icon className="h-2.5 w-2.5" />
                    {tm.cn}
                  </span>
                  {!selectMode && (
                    <button
                      onClick={() => deleteMaterial(m.id)}
                      className="absolute right-2 top-2 hidden group-hover:inline-flex items-center justify-center rounded-full bg-rose-500/90 p-1 text-white hover:bg-rose-600"
                      title="删除"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                  {!selectMode && m.type === "IMAGE" && (
                    <button
                      onClick={() => submitBatch([m.id])}
                      disabled={batchBusy}
                      className="absolute inset-x-2 bottom-2 hidden group-hover:inline-flex items-center justify-center gap-1 rounded-full bg-brand-600/95 px-2 py-1 text-2xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
                      title="用这张商品图建一张商品(看图写 Listing + 出主图),产出到「资产 · 我的商品」"
                    >
                      <Wand2 className="h-2.5 w-2.5" />
                      做成商品
                    </button>
                  )}
                </div>
                <div className="p-2.5 text-2xs">
                  <div className="font-medium truncate" title={m.originalName}>
                    {m.originalName}
                  </div>
                  <div className="mt-0.5 text-zinc-500 flex items-center justify-between">
                    <span>{formatBytes(m.sizeBytes)}</span>
                    <span>{new Date(m.createdAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-full border border-zinc-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur">
          <div className="text-xs text-zinc-600">
            已选 <span className="font-semibold text-zinc-900">{selected.size}</span> 张
            <span className="ml-1 text-zinc-400">· 预计最多约 {selected.size * PER_IMAGE_CREDITS} 积分</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            >
              清空
            </button>
            <button
              onClick={() => submitBatch(Array.from(selected))}
              disabled={batchBusy}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {batchBusy ? "提交中…" : "批量做商品"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
