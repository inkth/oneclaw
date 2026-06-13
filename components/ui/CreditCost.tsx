import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 动作处积分标识:贴在主操作按钮旁,告诉用户这次大概花多少积分。
 * 例:<CreditCost credits={50} />  → 「≈ 50 积分」
 */
export function CreditCost({
  credits,
  className,
}: {
  credits: number;
  className?: string;
}) {
  return (
    <span
      title={`本次约消耗 ${credits} 积分`}
      className={cn(
        "inline-flex items-center gap-1 text-2xs font-medium tabular-nums text-zinc-400",
        className
      )}
    >
      <Coins className="h-3 w-3" />≈ {credits} 积分
    </span>
  );
}
