import { redirect } from "next/navigation";
import { apiServer, getMe } from "@/lib/api-client";
import { AdminShell } from "./admin-shell";
import type { Dashboard } from "./admin-shared";

export const metadata = { title: "管理后台 · 发现猫" };

/** 管理后台。前端按 role 拦截(体验层),真正安全边界是后端 RequireAdmin 中间件。
 *  仅首屏「概览」在 SSR 拉取,其余分区在客户端首次激活时按需拉数(见各 Tab)。 */
export default async function AdminPage() {
  const me = await getMe();
  if (!me) redirect("/login?callbackUrl=/app/admin");
  if (me.role !== "admin") redirect("/app");

  let dashboard: Dashboard | null = null;
  try {
    dashboard = await apiServer<{ dashboard: Dashboard }>("/admin/dashboard").then((r) => r.dashboard);
  } catch {
    dashboard = null;
  }
  if (!dashboard) redirect("/app");

  return <AdminShell dashboard={dashboard} />;
}
