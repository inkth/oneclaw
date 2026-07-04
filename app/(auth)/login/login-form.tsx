"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LoginForm as SharedLoginForm } from "@/components/auth/LoginForm";

/** /login 页壳：从 URL 读 callbackUrl，登录成功后跳回。useSearchParams 由 page.tsx 的 Suspense 兜住。 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/app";
  const invite = params.get("invite") || undefined;

  return (
    <SharedLoginForm
      inviteCode={invite}
      onSuccess={() => {
        router.push(callbackUrl);
        router.refresh();
      }}
    />
  );
}
