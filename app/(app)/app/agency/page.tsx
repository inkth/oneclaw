import { redirect } from "next/navigation";
import { apiServer, getMe } from "@/lib/api-client";
import {
  AgencyClient,
  type AgencySummary,
  type AgencyCustomer,
  type CommissionRecord,
  type Withdrawal,
} from "./agency-client";

export const metadata = { title: "推广中心 · 发现猫" };

/** 代理商专页。非代理商(后端 /agency/summary 返回 403)重定向回工作台。 */
export default async function AgencyPage() {
  const me = await getMe();
  if (!me) redirect("/login?callbackUrl=/app/agency");

  let data: {
    summary: AgencySummary;
    customers: AgencyCustomer[];
    commissions: CommissionRecord[];
    withdrawals: Withdrawal[];
  } | null = null;
  try {
    const [summary, customers, commissions, withdrawals] = await Promise.all([
      apiServer<{ summary: AgencySummary }>("/agency/summary").then((r) => r.summary),
      apiServer<{ customers: AgencyCustomer[] }>("/agency/customers").then((r) => r.customers),
      apiServer<{ commissions: CommissionRecord[] }>("/agency/commissions").then((r) => r.commissions),
      apiServer<{ withdrawals: Withdrawal[] }>("/agency/withdrawals").then((r) => r.withdrawals),
    ]);
    data = { summary, customers, commissions, withdrawals };
  } catch {
    data = null;
  }
  if (!data) redirect("/app");

  return <AgencyClient {...data} />;
}
