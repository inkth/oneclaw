"use client";

import { useAuthModal, type AuthModalOptions } from "./AuthModalProvider";

/** 通用文本触发器：server 页面里需要一个「去登录」按钮时用，点击打开统一登录弹窗。 */
export function AuthModalTrigger({
  label,
  className,
  options,
}: {
  label: string;
  className?: string;
  options?: AuthModalOptions;
}) {
  const { open } = useAuthModal();
  return (
    <button onClick={() => open(options)} className={className}>
      {label}
    </button>
  );
}
