"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { Dashboard } from "./admin-shared";
import { DashboardTab } from "./admin-dashboard-tab";
import { UsersTab } from "./admin-users-tab";
import { OrdersTab } from "./admin-orders-tab";
import { AgencyTab } from "./admin-agency-tab";
import { AuditTab } from "./admin-audit-tab";

type TabKey = "dashboard" | "users" | "orders" | "agency" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "概览" },
  { key: "users", label: "用户" },
  { key: "orders", label: "订单账单" },
  { key: "agency", label: "代理商" },
  { key: "audit", label: "审计" },
];

export function AdminShell({ dashboard }: { dashboard: Dashboard }) {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div className="space-y-5">
      <PageHeader
        title="管理后台"
        badge={
          <Badge tone="brand" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            仅管理员
          </Badge>
        }
        description="平台运营:数据看板、用户管理、订单账单、代理分销与操作审计。"
      />

      {/* 分区 Tab */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--dk-stroke-divider)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              tab === t.key
                ? "border-brand-600 font-[550] text-ink"
                : "border-transparent text-[var(--dk-content-secondary)] hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab initial={dashboard} />}
      {tab === "users" && <UsersTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "agency" && <AgencyTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}
