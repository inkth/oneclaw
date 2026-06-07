import { LineChart, Sparkles, Upload, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "复盘 · OneClaw" };

// 复盘(GMVMax 数据诊断)随 Prisma 后端一并退役，待 Go 后端重建分析接口后恢复。
// 这里先做「即将上线」占位，保证侧边栏「复盘」可点击、不 404。
const STEPS = [
  {
    icon: Upload,
    title: "上传后台数据",
    desc: "导出 TikTok Shop / GMVMax 后台报表，一键上传，无需手动整理表格。",
  },
  {
    icon: Target,
    title: "四象限诊断",
    desc: "按花费与产出自动归类商品/计划，定位拖后腿与值得加投的对象。",
  },
  {
    icon: Sparkles,
    title: "AI 给出 SOP",
    desc: "结合诊断结果输出可执行的调整建议，照着做即可优化投放。",
  },
];

export default function AnalyticsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="复盘"
        badge={<Badge tone="neutral" outline={false}>即将上线</Badge>}
        description="把 TikTok Shop / GMVMax 的后台数据汇总到一处，自动诊断投放表现并给出可执行的优化 SOP。该模块正在随新后端重建中。"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex h-full flex-col rounded-xl border border-zinc-100 bg-zinc-50/60 p-5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <h2 className="mt-3 font-medium text-zinc-900">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>

      <p className="flex items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 px-5 py-4 text-sm text-zinc-400">
        <LineChart className="h-4 w-4 shrink-0" />
        数据诊断功能正在重建，敬请期待。
      </p>
    </div>
  );
}
