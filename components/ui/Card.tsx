import Link from "next/link";
import { cn } from "@/lib/utils";

// 照搬 Designkit：纯白 + 16px 圆角 + 发丝边 + 极弱阴影
const base = "dk-card";

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
        // §13：hover 上浮 2px + 描边转品牌色（不加重阴影）
        "group block p-5 lift hover:border-brand-300",
        className
      )}
    >
      {children}
    </Link>
  );
}
