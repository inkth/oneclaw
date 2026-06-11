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
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
          <Icon className="h-4 w-4" />
        </div>
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} />
        ) : href ? (
          <ArrowUpRight className="h-4 w-4 text-zinc-300 group-hover:text-brand-500 transition-colors" />
        ) : null}
      </div>
      <div
        className={cn(
          "flex items-baseline gap-2 tabular-nums font-semibold text-zinc-900",
          lg ? "mt-5 text-4xl" : "mt-5 text-2xl"
        )}
      >
        {value}
        {trend != null && <Delta value={trend} className="text-xs" />}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
      {hint && <div className="mt-1 text-2xs text-zinc-400">{hint}</div>}
    </>
  );

  const cls = cn(
    "group rounded-xl border border-zinc-200/80 bg-white shadow-xs",
    lg ? "p-6" : "p-5"
  );
  return href ? (
    <Link href={href} className={cn(cls, "lift hover:border-brand-200")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
