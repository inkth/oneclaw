import { cn } from "@/lib/utils";

/** 统一表格外观：圆角描边容器 + 横滚、淡表头、行 hover、数字右对齐 tabular-nums。
 *  用法：<TableWrap><table>...<THead/>...<Tr>...<Td/></Tr></table></TableWrap> */

export function TableWrap({
  className,
  minWidth = 920,
  children,
}: {
  className?: string;
  minWidth?: number;
  children: React.ReactNode;
}) {
  return (
    // 表格容器当卡片看：16px 圆角、无边框无阴影，与 dk-card 同规格（分层靠卡面色差）
    <div
      className={cn(
        "overflow-x-auto overscroll-x-contain rounded-2xl border border-black/[0.065] bg-[var(--dk-surface)] shadow-[0_1px_2px_rgba(18,20,25,.025)]",
        className
      )}
    >
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    // 表头底色用 surface-2（次级块），分界线用 divider（比行内分隔线更淡一档不必要，统一用 divider 即可）
    <thead className="border-b border-[var(--dk-stroke-divider)] bg-[var(--dk-surface-2)] text-xs text-[var(--dk-content-secondary)]">
      {children}
    </thead>
  );
}

export function Th({
  align = "left",
  className,
  children,
}: {
  align?: "left" | "right" | "center";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 font-[550]",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Tr({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    // 数据密集区保留行分隔线（divider 级),hover 底色统一用 action-regular（而非 zinc 灰）
    <tr
      className={cn(
        "border-b border-[var(--dk-stroke-divider)] transition-colors last:border-0 hover:bg-[var(--dk-action-regular)]",
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function Td({
  align = "left",
  className,
  children,
  ...props
}: { align?: "left" | "right" | "center" } & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle",
        align === "right" && "text-right tabular-nums",
        align === "center" && "text-center",
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}
