"use client";

import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/ui/BrandMark";
import { DialogShell } from "@/components/ui/Dialog";
import { toast } from "sonner";
import { AGENT_IDENTITY } from "@/lib/ui/tokens";
import { BRAND_SLOGAN } from "@/lib/brand";
import { LoginForm } from "./LoginForm";

const PITCH_KEYS = ["ANALYST", "DIRECTOR", "LISTING", "REVIEW"] as const;

const PITCH_DESC: Record<(typeof PITCH_KEYS)[number], string> = {
  ANALYST: "结合 TikTok 真实销售数据判断机会",
  DIRECTOR: "从商品素材到可发布的带货视频",
  LISTING: "标题、卖点、详情和主图一次备齐",
  REVIEW: "上传投放报表，找到该停和该加的素材",
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

  function handleSuccess() {
    toast.success("登录成功");
    onSuccess?.();
    router.refresh();
    onClose();
  }

  return (
    <DialogShell
      onClose={onClose}
      labelledBy="auth-modal-title"
      describedBy="auth-modal-description"
      panelClassName="max-w-3xl"
    >
      <div className="grid md:grid-cols-[5fr_6fr]">
        {/* 左：品牌面板（桌面端）。用 --accent-pop 而非硬编码色值，与全站电紫点睛通道同源 */}
        <div className="hidden flex-col justify-between bg-[var(--accent-pop)] p-8 text-white md:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                <BrandMark className="h-5 w-5" />
              </span>
              <span className="font-display text-lg font-semibold tracking-[0.06em]">
                发现猫
              </span>
            </div>
            <h3 className="mt-6 text-xl font-bold leading-snug tracking-tight">
              {BRAND_SLOGAN}
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

        {/* 移动端降级：品牌色顶部条（非渐变，画布保持平） */}
        <div className="flex items-center gap-2.5 bg-[var(--accent-pop)] px-5 py-3.5 text-white md:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
            <BrandMark className="h-4 w-4" />
          </span>
          <div>
            <span className="text-sm font-semibold">发现猫</span>
            <span className="ml-2 text-xs text-white/70">{BRAND_SLOGAN}</span>
          </div>
        </div>

        {/* 右：登录表单 */}
        <div className="p-6 sm:p-8">
          <h2 id="auth-modal-title" className="text-lg font-bold tracking-tight">
            {context?.title ?? "登录发现猫"}
          </h2>
          <p id="auth-modal-description" className="mt-1 text-xs leading-relaxed text-zinc-500">
            {context?.desc ?? "使用中国大陆手机号验证码登录；首次登录会自动创建账号和工作台。"}
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
    </DialogShell>
  );
}
