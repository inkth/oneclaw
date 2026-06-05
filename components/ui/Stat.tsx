import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** 统计卡：极简——图标轻描边、数字主导、可选跳转。不再用大渐变图标块。 */
export function Stat({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
          <Icon className="h-4 w-4" />
        </div>
        {href && (
          <ArrowUpRight className="h-4 w-4 text-zinc-300 group-hover:text-indigo-500 transition-colors" />
        )}
      </div>
      <div className="mt-5 text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
      {hint && <div className="mt-1 text-2xs text-zinc-400">{hint}</div>}
    </>
  );

  const cls = "group rounded-xl border border-zinc-200/80 bg-white p-5 transition-all";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-indigo-200 hover:shadow-sm")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
