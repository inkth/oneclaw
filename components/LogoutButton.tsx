"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiBrowser } from "@/lib/api-browser";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    try {
      await apiBrowser("/auth/logout", { method: "POST" });
    } catch {
      /* 即使失败也跳转 */
    }
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      title="退出登录"
      aria-label="退出登录"
      className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-[var(--dk-action-regular)] hover:text-ink transition-colors"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
