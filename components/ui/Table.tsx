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
    <div className={cn("overflow-x-auto rounded-xl border border-zinc-200/80 bg-white", className)}>
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-zinc-100 bg-zinc-50/60 text-xs text-zinc-500">
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
        "px-4 py-3 font-medium",
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
    <tr
      className={cn("border-b border-zinc-50 transition-colors last:border-0 hover:bg-zinc-50/60", className)}
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
