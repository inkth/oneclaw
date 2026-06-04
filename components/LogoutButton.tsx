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
      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
    >
      <LogOut className="h-3.5 w-3.5" />
      退出登录
    </button>
  );
}
