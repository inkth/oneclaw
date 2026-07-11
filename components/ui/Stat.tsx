import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Delta } from "./Delta";
import { Sparkline } from "./Sparkline";

/** 统计卡：图标轻描边、数字主导、可选跳转 / 涨跌 / 迷你趋势。
 *  size="lg" 把核心 KPI 放大（工作台 / 复盘头部）。trend/spark 全可选,向后兼容。 */
export function Stat({
  icon: Icon,
  label,
  value,
  hint,
  href,
  trend,
  spark,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  trend?: number | null;
  spark?: number[];
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  const inner = (
    <>
      <div className="flex items-center justify-between">
        {/* 图标底用次级面 surface-2；hover 态统一走 action-regular，不用 brand-50 浅紫 */}
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dk-surface-2)] text-[var(--dk-content-secondary)] transition-colors group-hover:bg-[var(--dk-action-regular)] group-hover:text-[var(--dk-content-primary)]">
          <Icon className="h-4 w-4" />
        </div>
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} />
        ) : href ? (
          <ArrowUpRight className="h-4 w-4 text-[var(--dk-content-tertiary)] transition-colors group-hover:text-[var(--dk-content-primary)]" />
        ) : null}
      </div>
      <div
        className={cn(
          "flex items-baseline gap-2 tabular-nums font-semibold text-[var(--dk-content-primary)]",
          lg ? "mt-5 text-4xl" : "mt-5 text-2xl"
        )}
      >
        {value}
        {trend != null && <Delta value={trend} className="text-xs" />}
      </div>
      <div className="mt-0.5 text-xs text-[var(--dk-content-secondary)]">{label}</div>
      {hint && <div className="mt-1 text-2xs text-[var(--dk-content-tertiary)]">{hint}</div>}
    </>
  );

  // 卡片规格走 dk-card（16px 圆角、无边框）；hover 只做 dk-lift 的离地阴影，
  // 不再换成 violet 描边（品牌色不进 hover 态装饰，只用于真正的强调场景）。
  const cls = "group dk-card p-6";
  return href ? (
    <Link href={href} className={cn(cls, "dk-lift")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
