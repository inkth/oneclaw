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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-2xs font-medium text-zinc-600">
          {eyebrow}
        </span>
      )}
      <h2 className="text-display-sm text-ink">{title}</h2>
      {description && (
        <p
          className={cn(
            "max-w-2xl text-base leading-relaxed text-zinc-500 text-cjk-relaxed",
            align === "center" && "mx-auto"
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
