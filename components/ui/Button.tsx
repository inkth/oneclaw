import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "brand" | "vibrant" | "secondary" | "ghost" | "subtle";
type Size = "sm" | "md" | "lg";

// primary / brand / vibrant 都属于明确主操作，统一使用深靛蓝；
// 中性工具动作继续使用 secondary / subtle，避免一页出现多个竞争焦点。
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 press",
  // 页面级主 CTA：深靛蓝
  brand: "pop-cta press",
  // 成交操作：同一深靛蓝，不额外制造第二种按钮主色
  vibrant: "pop-cta press",
  // 次级：白底 + 发丝描边
  secondary:
    "bg-white text-[var(--dk-content-primary)] border border-[var(--dk-stroke-border)] hover:bg-[var(--dk-btn-tertiary)] press",
  // 幽灵：仅 hover 淡蓝灰底（与导航轨同一个 --dk-action-regular）
  ghost:
    "text-[var(--dk-content-secondary)] hover:bg-[var(--dk-action-regular)] hover:text-[var(--dk-content-primary)]",
  // 弱强调：中性浅底
  subtle:
    "bg-[var(--dk-btn-tertiary)] text-[var(--dk-content-primary)] hover:bg-[var(--dk-btn-tertiary-hover)] press",
};

// Designkit 的按钮是全胶囊（Send / Agent teams 实测 border-radius 100px），不是 8 也不是 12。
// lg=44px 主 CTA 高度；胶囊比直角需要略宽的水平内距。
const SIZES: Record<Size, string> = {
  sm: "h-8 px-4 text-xs gap-1.5 rounded-full",
  md: "h-10 px-5 text-sm gap-2 rounded-full",
  lg: "h-11 px-6 text-[15px] gap-2 rounded-full",
};

// Designkit 的按钮字重实测 600。
// 禁用态用浅灰底灰字，而不是把近黑压到 50% 透明——后者读起来仍像「可点」。
const base =
  "inline-flex items-center justify-center font-semibold transition-colors whitespace-nowrap " +
  "disabled:pointer-events-none disabled:border-transparent disabled:bg-[var(--dk-btn-tertiary)] disabled:text-[var(--dk-content-tertiary)] disabled:shadow-none " +
  "shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai-violet/40";

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
