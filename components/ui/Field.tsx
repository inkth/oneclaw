import { cn } from "@/lib/utils";

const control =
  "w-full rounded-xl border border-[var(--dk-stroke-border)] bg-white px-3 text-sm text-[var(--dk-content-primary)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-[var(--dk-content-tertiary)] focus:border-brand-300 focus:ring-4 focus:ring-brand-100/60 disabled:bg-[var(--dk-surface-2)] disabled:text-[var(--dk-content-tertiary)]";

export function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-zinc-600", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "resize-none py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-10 pr-8", className)} {...props} />;
}
