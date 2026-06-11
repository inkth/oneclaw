"use client";

import { User } from "lucide-react";
import { useAuthModal } from "./AuthModalProvider";

/** 侧栏游客登录入口：打开统一登录弹窗，登录后原地刷新。 */
export function SidebarLoginButton() {
  const { open } = useAuthModal();

  return (
    <button
      onClick={() => open()}
      className="flex flex-col items-center gap-1 text-zinc-500 hover:text-ink transition-colors"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white">
        <User className="h-4 w-4" />
      </span>
      <span className="text-[11px]">登录</span>
    </button>
  );
}
