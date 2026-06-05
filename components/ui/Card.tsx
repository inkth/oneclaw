import Link from "next/link";
import { cn } from "@/lib/utils";

const base = "rounded-xl border border-zinc-200/80 bg-white";

export function Card({
  className,
  padded = true,
  children,
}: {
  className?: string;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return <div className={cn(base, padded && "p-5", className)}>{children}</div>;
}

/** 可点击卡片：统一 hover 抬升 + accent 描边。 */
export function CardLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        base,
        "group block p-5 transition-all hover:border-indigo-200 hover:shadow-sm",
        className
      )}
    >
      {children}
    </Link>
  );
}
