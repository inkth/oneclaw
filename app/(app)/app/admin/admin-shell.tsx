"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { SegmentedTabs } from "@/components/ui/Tabs";
import type { Dashboard } from "./admin-shared";
import { DashboardTab } from "./admin-dashboard-tab";
import { UsersTab } from "./admin-users-tab";
import { OrdersTab } from "./admin-orders-tab";
import { AgencyTab } from "./admin-agency-tab";
import { AuditTab } from "./admin-audit-tab";
import { FeedbackTab } from "./admin-feedback-tab";

type TabKey = "dashboard" | "users" | "orders" | "agency" | "feedback" | "audit";

const TABS: { value: TabKey; label: string }[] = [
  { value: "dashboard", label: "概览" },
  { value: "users", label: "用户" },
  { value: "orders", label: "订单账单" },
  { value: "agency", label: "代理商" },
  { value: "feedback", label: "反馈" },
  { value: "audit", label: "审计" },
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
        description="平台运营:数据看板、用户管理、订单账单、代理分销、用户反馈与操作审计。"
      />

      <SegmentedTabs
        items={TABS}
        value={tab}
        onValueChange={setTab}
        ariaLabel="管理后台分区"
      />

      {tab === "dashboard" && <DashboardTab initial={dashboard} />}
      {tab === "users" && <UsersTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "agency" && <AgencyTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}
