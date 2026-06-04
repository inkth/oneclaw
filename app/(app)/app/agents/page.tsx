import { redirect } from "next/navigation";

// Phase 1:Agent 工作流 模块迁移中,暂重定向到概览。
export default function DeferredPage() {
  redirect("/app");
}
