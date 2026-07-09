"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { toast } from "sonner";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";
import { LoginForm } from "./LoginForm";

const PITCH_KEYS = ["ANALYST", "DIRECTOR", "REVIEW"] as const;

const PITCH_DESC: Record<(typeof PITCH_KEYS)[number], string> = {
  ANALYST: "TikTok 真实销售数据，AI 判断能不能做",
  DIRECTOR: "商品图到带货视频，10 分钟出片",
  REVIEW: "上传投放报表，AI 告诉你停谁加谁",
};

/**
 * 统一登录注册弹窗：左侧产品简介（移动端降级为顶部条），右侧验证码登录表单。
 * 登录成功后不跳转，原地 router.refresh() 让 server components 重取身份。
 */
export function AuthModal({
  context,
  onClose,
  onSuccess,
}: {
  context?: { title?: string; desc?: string };
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSuccess() {
    toast.success("登录成功");
    onSuccess?.();
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative grid w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-[5fr_6fr]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 左：品牌面板（桌面端） */}
        <div className="hidden flex-col justify-between bg-[#6e56ff] p-8 text-white md:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <BrandMark className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="font-display text-lg font-semibold tracking-[0.06em]">
                发现猫
              </span>
            </div>
            <h3 className="mt-6 text-xl font-bold leading-snug tracking-tight">
              你的 AI 出海团队
            </h3>
            <ul className="mt-6 space-y-5">
              {PITCH_KEYS.map((key) => {
                const { label, icon: Icon } = AGENT_IDENTITY[key];
                return (
                  <li key={key} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-white/70">
                        {PITCH_DESC[key]}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-8 text-2xs text-white/60">
            中国大陆手机号验证码即登录 · 新用户自动开通工作台
          </p>
        </div>

        {/* 移动端降级：渐变顶部条 */}
        <div className="flex items-center gap-2.5 bg-[#6e56ff] px-5 py-3.5 text-white md:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
            <BrandMark className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <div>
            <span className="text-sm font-semibold">发现猫</span>
            <span className="ml-2 text-xs text-white/70">你的 AI 出海团队</span>
          </div>
        </div>

        {/* 右：登录表单 */}
        <div className="p-6 sm:p-8">
          <h2 className="text-lg font-bold tracking-tight">
            {context?.title ?? "登录 / 注册 发现猫"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {context?.desc ?? "中国大陆手机号，验证码登录，新用户自动开通工作台。"}
          </p>
          <div className="mt-6">
            <LoginForm onSuccess={handleSuccess} />
          </div>
          <p className="mt-5 text-center text-2xs text-zinc-400">
            登录即表示同意 <a href="/legal/terms" className="underline" target="_blank">服务条款</a> 与{" "}
            <a href="/legal/privacy" className="underline" target="_blank">隐私政策</a>。
          </p>
        </div>
      </div>
    </div>
  );
}
