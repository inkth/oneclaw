import {
  forwardRef,
  type ButtonHTMLAttributes,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const surfaceStyles = cva(
  "overflow-hidden border border-black/[0.08] bg-[var(--surface)] shadow-[0_18px_46px_-36px_rgba(18,20,25,0.6),0_2px_8px_-6px_rgba(18,20,25,0.16)] transition-[border-color,box-shadow] duration-200 focus-within:border-brand-200 focus-within:shadow-[-20px_18px_48px_-38px_rgba(255,132,92,0.34),20px_16px_48px_-38px_rgba(74,175,145,0.28),0_22px_54px_-34px_rgba(48,70,184,0.3),0_3px_10px_-7px_rgba(18,20,25,0.18)]",
  {
    variants: {
      variant: {
        console: "rounded-[24px]",
        hero: "rounded-[24px] bg-white/95",
        compact: "rounded-2xl",
        form: "rounded-2xl",
      },
    },
    defaultVariants: { variant: "console" },
  },
);

const textareaStyles = cva(
  "w-full resize-none bg-transparent outline-none placeholder:text-zinc-400",
  {
    variants: {
      variant: {
        console:
          "min-h-40 px-5 pb-4 pt-5 text-[15px] leading-relaxed sm:px-6 sm:pt-6",
        hero:
          "min-h-24 px-5 py-5 text-[15px] leading-relaxed sm:min-h-28 sm:px-6",
        compact: "max-h-28 min-h-10 px-3 py-2.5 text-sm leading-relaxed",
        form: "px-4 py-3 text-sm leading-relaxed",
      },
    },
    defaultVariants: { variant: "console" },
  },
);

const toolbarStyles = cva("flex flex-wrap items-center gap-2", {
  variants: {
    variant: {
      console: "px-4 pb-4 sm:px-5 sm:pb-5",
      hero: "px-3 pb-3 pt-1",
      compact: "p-2",
      form: "border-t border-zinc-100 px-3 py-2.5",
    },
  },
  defaultVariants: { variant: "console" },
});

const sendButtonStyles = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink font-semibold text-white shadow-[0_8px_20px_-12px_rgba(18,20,25,0.9)] transition-all hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_12px_24px_-13px_rgba(18,20,25,0.9)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2",
  {
    variants: {
      size: {
        default: "px-5 py-2 text-sm",
        hero: "px-4 py-2 text-sm",
        compact: "h-10 w-10 p-0",
        form: "px-4 py-1.5 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type SurfaceVariant = VariantProps<typeof surfaceStyles>;

export function ComposerSurface({
  variant,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & SurfaceVariant) {
  return <div className={cn(surfaceStyles({ variant }), className)} {...props} />;
}

export function ComposerForm({
  variant,
  className,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & SurfaceVariant) {
  return <form className={cn(surfaceStyles({ variant }), className)} {...props} />;
}

export const ComposerTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & VariantProps<typeof textareaStyles>
>(({ variant, className, ...props }, ref) => (
  // 四个 variant 都是 leading-relaxed，统一补在 className 之后：
  // 调用方传字号会让 twMerge 删掉靠前的 leading-*，行距塌回紧排。
  <textarea
    ref={ref}
    className={cn(textareaStyles({ variant }), className, "leading-relaxed")}
    {...props}
  />
));
ComposerTextarea.displayName = "ComposerTextarea";

export function ComposerToolbar({
  variant,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof toolbarStyles>) {
  return <div className={cn(toolbarStyles({ variant }), className)} {...props} />;
}

export function ComposerSendButton({
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof sendButtonStyles>) {
  return <button className={cn(sendButtonStyles({ size }), className)} {...props} />;
}
