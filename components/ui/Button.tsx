import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "subtle";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // 主操作：Vercel 风实心黑
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm",
  // 次级：白底 + 描边
  secondary: "bg-white text-zinc-800 ring-1 ring-zinc-200 hover:ring-zinc-300 hover:bg-zinc-50",
  // 幽灵：仅 hover 浅底
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  // 弱强调：accent 浅底
  subtle: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
};

const base =
  "inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, SIZES[size], VARIANTS[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  children,
  href,
  ...props
}: CommonProps & { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Link href={href} className={cn(base, SIZES[size], VARIANTS[variant], className)} {...props}>
      {children}
    </Link>
  );
}
