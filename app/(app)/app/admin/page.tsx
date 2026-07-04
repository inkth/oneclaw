import { redirect } from "next/navigation";
import { apiServer, getMe } from "@/lib/api-client";
import {
  AdminClient,
  type Overview,
  type AdminAgencyRow,
  type AdminWithdrawalRow,
} from "./admin-client";

export const metadata = { title: "管理后台 · 发现猫" };

/** 管理后台。前端按 role 拦截(体验层),真正安全边界是后端 RequireAdmin 中间件。 */
export default async function AdminPage() {
  const me = await getMe();
  if (!me) redirect("/login?callbackUrl=/app/admin");
  if (me.role !== "admin") redirect("/app");

  let data: {
    overview: Overview;
    agencies: AdminAgencyRow[];
    withdrawals: AdminWithdrawalRow[];
  } | null = null;
  try {
    const [overview, agencies, withdrawals] = await Promise.all([
      apiServer<{ overview: Overview }>("/admin/overview").then((r) => r.overview),
      apiServer<{ agencies: AdminAgencyRow[] }>("/admin/agencies").then((r) => r.agencies),
      apiServer<{ withdrawals: AdminWithdrawalRow[] }>("/admin/withdrawals").then((r) => r.withdrawals),
    ]);
    data = { overview, agencies, withdrawals };
  } catch {
    data = null;
  }
  if (!data) redirect("/app");

  return <AdminClient {...data} />;
}
