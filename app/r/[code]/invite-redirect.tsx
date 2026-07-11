"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 把邀请码写进 localStorage(兜底「稍后从弹窗登录」的路径)后转登录页并带上 ?invite=CODE。 */
export function InviteRedirect({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => {
    const c = code.trim().toUpperCase();
    if (c) {
      try {
        localStorage.setItem("oc_invite", c);
      } catch {
        /* 隐私模式禁写 localStorage 时，靠 query 仍可归因 */
      }
      router.replace(`/login?invite=${encodeURIComponent(c)}`);
    } else {
      router.replace("/login");
    }
  }, [code, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      正在跳转…
    </div>
  );
}
