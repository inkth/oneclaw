import { cn } from "@/lib/utils";

/** 筛选、搜索和批量操作的统一承载层。 */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border border-black/[0.055] bg-white/55 p-2 shadow-[0_1px_2px_rgba(18,20,25,.02)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
