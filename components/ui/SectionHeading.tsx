import { cn } from "@/lib/utils";

/** 营销 / 详情区块标题：eyebrow（小标）+ 大标题 + 描述。区别于页级 PageHeader。
 *  align="center" 用于营销 section,默认左对齐用于 app 内区块。 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className
      )}
    >
      {eyebrow && (
        // eyebrow 不是 Tab/Pill，胶囊形没有豁免，收到 8px
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dk-stroke-border)] bg-[var(--dk-surface)] px-3 py-1 text-2xs font-[550] text-[var(--dk-content-secondary)]">
          {eyebrow}
        </span>
      )}
      <h2 className="text-display-sm text-ink">{title}</h2>
      {description && (
        <p
          className={cn(
            // 行高由 cjk-relaxed（1.75）接管，不再叠 leading-relaxed
            "max-w-2xl text-base cjk-relaxed text-[var(--dk-content-secondary)]",
            align === "center" && "mx-auto"
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
