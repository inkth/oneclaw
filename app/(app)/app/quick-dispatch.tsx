"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, BadgeCheck, Loader2, Send, X } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { Button } from "@/components/ui/Button";
import { CreditCost } from "@/components/ui/CreditCost";
import { CREDIT_COST } from "@/lib/credits";
import { AGENT_IDENTITY, type AgentKey } from "@/lib/ui/tokens";
import { TASK_DISPATCHED_EVENT } from "./floating-mascot";

// 同 lib/api-browser 的约定:生产同域留空,本地分端口开发指到 Go 端口。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/**
 * 轻量派活浮层：猫标情境动作的原地入口——用户不离开当前页（商品/达人/视频数据
 * 还在眼前）就把指令发出去，派活成功后交给运行态信标追踪，揭晓时再进会话。
 * 只承担「预设 Agent + 可编辑指令 + 发送」这一个子集；素材/人设/出片设置等
 * 完整能力仍走「展开完整对话」到新对话页。
 */
export function QuickDispatchSheet({
  workspaceId,
  agent,
  initialPrompt,
  productId,
  fullHref,
  entityName,
  discoverRef,
  onClose,
}: {
  workspaceId: string;
  agent: AgentKey;
  initialPrompt: string;
  /** 结构化商品：仅 DIRECTOR/LISTING 派活时随任务下发（与 composer 同规则） */
  productId?: string;
  /** 「展开完整对话」出口：带同样预填的新对话页 */
  fullHref: string;
  /** 当前页实体名，仅作上下文提示展示 */
  entityName?: string;
  /** discover 商品引用：随任务下发，后端注入销量/佣金/达人等真实数据做单品判断 */
  discoverRef?: { productId: string; region: string };
  onClose: () => void;
}) {
  const identity = AGENT_IDENTITY[agent];
  const [input, setInput] = useState(initialPrompt);
  const [sending, setSending] = useState(false);
  const { open: openAuthModal } = useAuthModal();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (box) {
      box.focus();
      // 光标停在末尾：预填是完整指令，用户通常是补充而不是重写
      box.setSelectionRange(box.value.length, box.value.length);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (!workspaceId) {
      openAuthModal({
        title: "登录后即可派活",
        desc: "对话和产出会保存在你的工作台。登录后回到本页再发一次即可。",
      });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/agent-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agent,
          input: text,
          // 与 agent-composer 同规则：结构化商品只对创作类任务生效
          ...((agent === "DIRECTOR" || agent === "LISTING") && productId ? { productId } : {}),
          // discover 商品引用（ANALYST）：后端注入真实数据走单品判断，替代榜单选品
          ...(agent === "ANALYST" && discoverRef
            ? { discoverProductId: discoverRef.productId, discoverRegion: discoverRef.region }
            : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error?.message || json?.message || "发送失败，稍后再试");
        return;
      }
      // 运行态信标（猫标）立刻进入进行中状态，任务终态时它会揭晓提醒
      window.dispatchEvent(new Event(TASK_DISPATCHED_EVENT));
      toast.success(`已派给${identity.label}`, { description: "完成时右下角猫标会提醒你，点它可回到会话。" });
      onClose();
    } catch {
      toast.error("网络异常，稍后再试");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60]">
      {/* 轻遮罩：可点击关闭，但保持页面内容可见——浮层的意义就是上下文还在眼前 */}
      <button type="button" aria-label="关闭派活浮层" className="absolute inset-0 bg-black/15" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`派活给${identity.label}`}
        className="absolute inset-x-3 bottom-[88px] mx-auto max-w-[560px] rounded-2xl border border-black/[0.08] bg-white p-3 shadow-[0_24px_64px_-24px_rgba(18,20,25,0.35)] md:bottom-10"
      >
        <div className="flex items-center gap-2 px-1 pb-2">
          <span className={`h-2 w-2 rounded-full ${identity.dot}`} aria-hidden />
          <span className="text-sm font-semibold text-ink">{identity.label}</span>
          {entityName && (
            <span
              title={discoverRef ? "已附带该商品的真实销量 / 佣金 / 达人数据，Agent 会基于真实数字判断" : undefined}
              className="inline-flex min-w-0 flex-1 items-center gap-1 truncate rounded-full bg-[var(--dk-btn-tertiary)] px-2.5 py-1 text-2xs font-medium text-[var(--dk-content-secondary)]"
            >
              {discoverRef && <BadgeCheck className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />}
              <span className="truncate">
                {discoverRef ? "已附商品数据" : "正在看"} · {entityName}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--dk-content-tertiary)] transition-colors hover:bg-[var(--dk-action-regular)] hover:text-[var(--dk-content-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          ref={boxRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          className="w-full resize-none rounded-xl border border-black/[0.07] bg-[var(--dk-canvas,#fafafa)] px-3 py-2.5 text-sm leading-6 text-ink outline-none transition-colors focus:border-brand-300 focus:bg-white"
          placeholder="想让它帮你做什么？"
        />
        <div className="flex items-center gap-3 pt-2">
          <CreditCost credits={CREDIT_COST.agentTask} />
          <Link
            href={fullHref}
            onClick={onClose}
            className="inline-flex items-center gap-0.5 text-2xs font-medium text-[var(--dk-content-tertiary)] transition-colors hover:text-[var(--dk-content-primary)]"
          >
            展开完整对话
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <span className="ml-auto hidden text-2xs text-[var(--dk-content-tertiary)] sm:block">⌘/Ctrl + Enter</span>
          <Button size="sm" onClick={() => void send()} disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
