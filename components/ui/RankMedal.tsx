import { cn } from "@/lib/utils";
import { RANK_MEDAL } from "@/lib/ui/tokens";

/** 榜单名次：Top3 金/银/铜实体奖牌，>3 灰底数字。榜单序号一律用它,替换裸 idx+1。 */
export function RankMedal({ rank, className }: { rank: number; className?: string }) {
  const isMedal = rank >= 1 && rank <= 3;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
        isMedal
          ? RANK_MEDAL[rank as 1 | 2 | 3]
          : "bg-zinc-100 text-zinc-400 font-semibold",
        className
      )}
    >
      {rank}
    </span>
  );
}
