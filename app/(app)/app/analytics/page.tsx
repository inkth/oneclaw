import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-md py-16">
      <EmptyState
        icon={BarChart3}
        title="复盘"
        description="销售、流量与内容表现看板正在打磨中，帮你复盘每一条视频的转化，敬请期待。"
        action={<Badge tone="neutral">即将上线</Badge>}
      />
    </div>
  );
}
