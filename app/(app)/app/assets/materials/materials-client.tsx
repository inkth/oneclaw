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
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

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
  IMAGE: { cn: "图片", icon: ImageIcon, tone: "bg-indigo-50 text-indigo-700" },
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
  storageDriver,
  initialMaterials,
  isGuest = false,
}: {
  workspaceId: string;
  storageReady: boolean;
  storageDriver: string;
  initialMaterials: Material[];
  isGuest?: boolean;
}) {
  const router = useRouter();

  function gateGuest(): boolean {
    if (!isGuest) return false;
    toast("登录后即可操作", {
      action: {
        label: "去登录",
        onClick: () => {
          window.location.href = "/login?callbackUrl=/app";
        },
      },
    });
    return true;
  }
  const [materials, setMaterials] = useState(initialMaterials);
  const [filter, setFilter] = useState<"ALL" | MaterialType>("ALL");
  const [uploading, setUploading] = useState<string[]>([]); // 文件名列表，UI 显示 progress
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const visible =
    filter === "ALL" ? materials : materials.filter((m) => m.type === filter);

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
        const res = await fetch(`/api/workspaces/${workspaceId}/materials`, {
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
    const res = await fetch(`/api/workspaces/${workspaceId}/materials/${id}`, {
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
            上传你自己的图片 / 视频 / 音频，OneClaw 会在视频生成时优先用作底料。
            {storageReady ? (
              <span className="ml-2 text-2xs text-emerald-600">
                · 存储：{storageDriver}
              </span>
            ) : null}
          </>
        }
        actions={
          <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full p-0.5 self-start">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:bg-indigo-50 hover:text-indigo-700"
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
            ? "border-indigo-300 bg-indigo-50/40"
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
        <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 space-y-1">
          {uploading.map((name) => (
            <div key={name} className="flex items-center gap-2 text-xs text-indigo-900">
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
            return (
              <div key={m.id} className="group relative rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
                <div className="aspect-square bg-zinc-50 flex items-center justify-center relative">
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
                  <button
                    onClick={() => deleteMaterial(m.id)}
                    className="absolute right-2 top-2 hidden group-hover:inline-flex items-center justify-center rounded-full bg-rose-500/90 p-1 text-white hover:bg-rose-600"
                    title="删除"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
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
    </div>
  );
}
