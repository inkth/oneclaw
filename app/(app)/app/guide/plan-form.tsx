"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, Route } from "lucide-react";

/** 描述框的示例开局:点一下整段填入,新手不用自己想怎么描述。 */
const EXAMPLES = [
  "预算 5000 元,没有货源,想做美国市场,每天能投入 2 小时",
  "工厂有现成的宠物用品,想试试 TikTok 美区,完全没做过",
  "做过国内电商,想转跨境,预算 2 万,不知道选什么类目",
];

/**
 * 「结合你的情况排路线」:全流程地图的个性化收尾,现在由工作台的跨境顾问(ADVISOR)承接——
 * 带着描述跳工作台预填顾问输入框,发出即开一条可持续追问的会话(免积分,原一次性 guide/plan 退役)。
 */
export function GuidePlanForm() {
  const [goal, setGoal] = useState("");
  const router = useRouter();

  function submit() {
    const g = goal.trim();
    router.push(`/app?agent=ADVISOR${g ? `&prompt=${encodeURIComponent(g)}` : ""}`);
  }

  return (
    <section className="space-y-4">
      <div className="text-center">
        <h2 className="flex items-center justify-center gap-2 text-base font-semibold text-ink">
          <Route className="h-4.5 w-4.5 text-brand-500" />
          结合你的情况,排条起步路线
        </h2>
        <p className="mt-1.5 text-xs text-zinc-500">
          说说预算、有没有货、想做哪个市场,跨境顾问给你排出先后顺序——能替你干的步骤直接接力派活,还能接着追问。
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
            disabled={!goal.trim()}
            className="press ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#1c1d1f] px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:pointer-events-none disabled:opacity-50"
          >
            <Compass className="h-4 w-4" />
            去问跨境顾问
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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
    </section>
  );
}
