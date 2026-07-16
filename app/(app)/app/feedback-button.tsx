"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Popover } from "@/components/ui/Popover";
import { apiBrowser } from "@/lib/api-browser";
import { cn } from "@/lib/utils";

type FeedbackType = "issue" | "idea";

const TYPE_OPTS: { value: FeedbackType; label: string }[] = [
  { value: "issue", label: "遇到问题" },
  { value: "idea", label: "产品建议" },
];

/**
 * 顶栏「反馈」入口：胶囊按钮 + 原地 Popover(不跳页)。仅登录用户可见(游客走 Footer 邮箱)。
 * 提交自动带当前 pathname,后台能看到「在哪个页面说的」。
 * 草稿留在父级 state:误点外部关掉再点开,写了一半的话还在;提交成功才清空。
 */
export function FeedbackButton({ workspaceId }: { workspaceId: string | null }) {
  const pathname = usePathname();
  const [type, setType] = useState<FeedbackType>("issue");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(close: () => void) {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await apiBrowser("/feedback", {
        method: "POST",
        body: JSON.stringify({ type, content, pathname, workspaceId }),
      });
      setText("");
      setSent(true);
      setTimeout(() => {
        close();
        setSent(false);
      }, 1200);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败,请稍后再试");
    } finally {
      setSending(false);
    }
  }

  return (
    <Popover
      align="end"
      panelClassName="w-80"
      trigger={({ open }) => (
        <span
          title="意见反馈"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-[var(--dk-stroke-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors sm:px-3",
            open ? "bg-[var(--dk-action-regular)] text-zinc-900" : "hover:bg-[var(--dk-action-regular)] hover:text-zinc-900"
          )}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">反馈</span>
        </span>
      )}
    >
      {({ close }) =>
        sent ? (
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-zinc-600">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check className="h-5 w-5" />
            </span>
            已收到，谢谢你的反馈
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              {TYPE_OPTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setType(o.value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    type === o.value
                      ? "border-brand-200 bg-brand-50 text-brand-700"
                      : "border-[var(--dk-stroke-border)] bg-white text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={2000}
              autoFocus
              placeholder={type === "issue" ? "哪里不对劲？说说当时在做什么…" : "希望发现猫加点什么、改点什么？"}
              className="w-full resize-none rounded-xl border border-[var(--dk-stroke-border)] bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-200"
            />
            <div className="flex items-center justify-between">
              <span className="text-2xs text-zinc-400">会带上当前页面，方便我们定位</span>
              <button
                type="button"
                disabled={!text.trim() || sending}
                onClick={() => submit(close)}
                className="pop-cta inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                提交
              </button>
            </div>
          </div>
        )
      }
    </Popover>
  );
}
