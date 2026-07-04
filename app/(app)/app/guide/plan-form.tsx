"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Loader2, Route, Sparkles } from "lucide-react";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";
import { useAuthModal } from "@/components/auth/AuthModalProvider";

type PlanStep = {
  title: string;
  detail: string;
  /** 非空=发现猫能替你干,渲染接力按钮带 prompt 跳工作台。 */
  agent?: string;
  prompt?: string;
};

type Plan = { summary: string; steps: PlanStep[] };

/** 描述框的示例开局:点一下整段填入,新手不用自己想怎么描述。 */
const EXAMPLES = [
  "预算 5000 元,没有货源,想做美国市场,每天能投入 2 小时",
  "工厂有现成的宠物用品,想试试 TikTok 美区,完全没做过",
  "做过国内电商,想转跨境,预算 2 万,不知道选什么类目",
];

/**
 * 「结合你的情况排路线」:全流程地图的 LLM 个性化收尾。
 * 免积分;游客点生成时弹登录(卡在意愿最高的时刻转化)。
 */
export function GuidePlanForm({
  workspaceId,
  isGuest,
}: {
  workspaceId: string;
  isGuest: boolean;
}) {
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const { open: openAuthModal } = useAuthModal();

  async function submit() {
    if (loading || !goal.trim()) return;
    if (isGuest || !workspaceId) {
      openAuthModal({
        title: "登录后免费生成你的起步路线",
        desc: "路线会结合你的预算和情况定制,每一步都能直接派活给 Agent。",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/guide/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error?.message || json?.message || "生成失败,稍后再试");
        return;
      }
      setPlan(json.data.plan as Plan);
    } catch {
      toast.error("网络异常,稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="text-center">
        <h2 className="flex items-center justify-center gap-2 text-base font-semibold text-ink">
          <Route className="h-4.5 w-4.5 text-brand-500" />
          结合你的情况,排条起步路线
        </h2>
        <p className="mt-1.5 text-xs text-zinc-500">
          说说预算、有没有货、想做哪个市场,AI 给你排出先后顺序——能替你干的步骤直接派活。
        </p>
      </div>

      <div className="dk-card overflow-hidden focus-within:border-black/15">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          placeholder={`例:${EXAMPLES[0]}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="w-full resize-none bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none placeholder:text-zinc-400"
        />
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <span className="text-2xs text-zinc-400">免费</span>
          <button
            onClick={submit}
            disabled={loading || !goal.trim()}
            className="press ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "排路线中…" : "生成我的路线"}
          </button>
        </div>
      </div>

      {!plan && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => setGoal(e)}
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:border-black/20 hover:text-ink"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {plan && (
        <div className="dk-card space-y-4 px-4 py-4">
          <p className="text-sm leading-relaxed text-zinc-600">{plan.summary}</p>
          <ol className="space-y-3">
            {plan.steps.map((s, i) => {
              const identity =
                s.agent && s.agent in AGENT_IDENTITY
                  ? AGENT_IDENTITY[s.agent as keyof typeof AGENT_IDENTITY]
                  : null;
              return (
                <li key={`${i}-${s.title}`} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{s.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{s.detail}</p>
                    {identity && (
                      <Link
                        href={`/app?agent=${s.agent}${s.prompt ? `&prompt=${encodeURIComponent(s.prompt)}` : ""}`}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
                      >
                        <identity.icon className="h-3.5 w-3.5" />
                        派活给{identity.label}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
