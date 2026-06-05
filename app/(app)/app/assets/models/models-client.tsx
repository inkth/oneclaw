"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UserSquare2,
  Plus,
  Star,
  Trash2,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Kind = "DIGITAL_HUMAN" | "REAL_PERSON";
type Gender = "FEMALE" | "MALE" | "NEUTRAL";

type ModelAsset = {
  id: string;
  name: string;
  kind: Kind;
  gender: Gender;
  style: string | null;
  description: string | null;
  avatarUrl: string | null;
  usageCount: number;
  isFavorite: boolean;
  createdAt: string;
};

// 预设：用户没自建模特时，给他点灵感
const PRESETS: Array<{
  name: string;
  kind: Kind;
  gender: Gender;
  style: string;
  description: string;
  emoji: string;
}> = [
  { name: "都市少女", kind: "DIGITAL_HUMAN", gender: "FEMALE", style: "甜美 / 时尚", description: "20+ 都市年轻女性，适合美妆 / 服饰 / 小家电", emoji: "💁‍♀️" },
  { name: "商务女精英", kind: "DIGITAL_HUMAN", gender: "FEMALE", style: "干练 / 自信", description: "30+ 职场，适合数码 / 办公 / 高客单产品", emoji: "💼" },
  { name: "户外大叔", kind: "DIGITAL_HUMAN", gender: "MALE", style: "硬朗 / 真实", description: "户外露营 / 工具 / 男性消费品", emoji: "🧔" },
  { name: "学生男友", kind: "DIGITAL_HUMAN", gender: "MALE", style: "阳光 / 邻家", description: "Gen Z 数码 / 潮玩 / 运动", emoji: "👦" },
  { name: "宝妈日常", kind: "DIGITAL_HUMAN", gender: "FEMALE", style: "温柔 / 信赖", description: "母婴 / 厨房 / 家居好物", emoji: "👩‍🍼" },
  { name: "汪星人主理人", kind: "DIGITAL_HUMAN", gender: "NEUTRAL", style: "宠粉 / 治愈", description: "宠物用品 / 萌宠生活", emoji: "🐕" },
];

const genderMeta: Record<Gender, { cn: string; cls: string }> = {
  FEMALE: { cn: "女", cls: "bg-rose-50 text-rose-700" },
  MALE: { cn: "男", cls: "bg-sky-50 text-sky-700" },
  NEUTRAL: { cn: "通用", cls: "bg-zinc-100 text-zinc-700" },
};

export function ModelsClient({
  workspaceId,
  initialModels,
  isGuest = false,
}: {
  workspaceId: string;
  initialModels: ModelAsset[];
  isGuest?: boolean;
}) {
  const router = useRouter();
  const [models, setModels] = useState(initialModels);
  const [modalOpen, setModalOpen] = useState(false);

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

  async function createFromPreset(p: (typeof PRESETS)[number]) {
    if (gateGuest()) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        kind: p.kind,
        gender: p.gender,
        style: p.style,
        description: p.description,
      }),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      setModels((prev) => [json.data.model, ...prev]);
      toast.success(`已加入：${p.name}`);
      router.refresh();
    } else {
      toast.error(json?.error?.message ?? "创建失败");
    }
  }

  async function toggleFavorite(m: ModelAsset) {
    const res = await fetch(`/api/workspaces/${workspaceId}/models/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !m.isFavorite }),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      setModels((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, isFavorite: !x.isFavorite } : x)),
      );
    }
  }

  async function deleteModel(id: string) {
    if (!confirm("确定删除该模特？")) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/models/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setModels((prev) => prev.filter((m) => m.id !== id));
      toast.success("已删除");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="模特"
        description="为视频生成准备的人设。可选 AI 数字人或绑定的真人合作模特。"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              if (gateGuest()) return;
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            创建模特
          </Button>
        }
      />

      {models.length === 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-6">
          <div className="flex items-center gap-1.5 text-xs font-medium text-brand-700 mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            一键添加预设人设
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => createFromPreset(p)}
                className="group rounded-xl border border-zinc-200/80 bg-white p-3 hover:border-brand-200 hover:shadow-sm transition-all text-left"
              >
                <div className="aspect-square rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-4xl">
                  {p.emoji}
                </div>
                <div className="mt-2 text-sm font-medium">{p.name}</div>
                <div className="mt-0.5 text-2xs text-zinc-500 truncate">
                  {p.style}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {models.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {models.map((m) => {
            const g = genderMeta[m.gender];
            return (
              <div key={m.id} className="group rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
                <div className="aspect-[3/4] bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center relative">
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt={m.name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <UserSquare2 className="h-10 w-10 text-zinc-400" />
                  )}
                  <div className="absolute left-2 top-2 flex gap-1">
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-2xs font-medium ${g.cls}`}>
                      {g.cn}
                    </span>
                    {m.kind === "DIGITAL_HUMAN" && (
                      <span className="inline-flex rounded-full bg-brand-50 px-1.5 py-0.5 text-2xs font-medium text-brand-700">
                        AI
                      </span>
                    )}
                  </div>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => toggleFavorite(m)}
                      className="inline-flex items-center justify-center rounded-full bg-white/90 p-1 hover:bg-white"
                      title={m.isFavorite ? "取消收藏" : "收藏"}
                    >
                      <Star
                        className={`h-3 w-3 ${m.isFavorite ? "fill-amber-400 text-amber-400" : "text-zinc-400"}`}
                      />
                    </button>
                    <button
                      onClick={() => deleteModel(m.id)}
                      className="inline-flex items-center justify-center rounded-full bg-rose-500/90 p-1 text-white hover:bg-rose-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {m.isFavorite && (
                    <Star className="absolute right-2 bottom-2 h-3 w-3 fill-amber-400 text-amber-400 group-hover:opacity-0" />
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium truncate">{m.name}</div>
                  <div className="mt-0.5 text-2xs text-zinc-500 truncate">
                    {m.style ?? "—"}
                  </div>
                  {m.usageCount > 0 && (
                    <div className="mt-1.5 text-2xs text-zinc-400">
                      已使用 {m.usageCount} 次
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4 text-xs text-zinc-600 leading-relaxed">
        💡 真实数字人 / 真人对接（HeyGen、D-ID、阿里云灵境）正在开发中。
        当前模特是「人设档案」，给创意总监 Agent 写脚本时作为风格输入。
      </div>

      {modalOpen && (
        <CreateModelModal
          workspaceId={workspaceId}
          onClose={() => setModalOpen(false)}
          onCreated={(model) => {
            setModels((prev) => [model, ...prev]);
            setModalOpen(false);
            toast.success("已创建");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateModelModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (m: ModelAsset) => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("NEUTRAL");
  const [style, setStyle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("请填写名称");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        kind: "DIGITAL_HUMAN",
        gender,
        style: style.trim() || undefined,
        description: description.trim() || undefined,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok || !json.ok) {
      setError(json?.error?.message ?? "创建失败");
      return;
    }
    onCreated(json.data.model);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
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
          <h2 className="text-lg font-semibold tracking-tight">创建模特</h2>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="例：户外探险家"
              className="w-full rounded-lg border border-zinc-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">性别</label>
            <div className="grid grid-cols-3 gap-2">
              {(["FEMALE", "MALE", "NEUTRAL"] as Gender[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    gender === g
                      ? "border-brand-300 bg-brand-50/40 ring-2 ring-brand-200"
                      : "border-zinc-200/80 hover:border-zinc-300"
                  }`}
                >
                  {genderMeta[g].cn}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">风格（可选）</label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              maxLength={80}
              placeholder="例：阳光 / 商务 / 治愈"
              className="w-full rounded-lg border border-zinc-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={800}
              rows={3}
              placeholder="人设、年龄段、典型场景、口播语气…"
              className="w-full rounded-lg border border-zinc-200/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-100">
              {error}
            </div>
          )}

          <Button
            variant="primary"
            onClick={submit}
            disabled={submitting}
            className="w-full"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            创建
          </Button>
        </div>
      </div>
    </div>
  );
}
