import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

/**
 * 新手指南开场卡:工作台首页的认知入口。
 * 对跨境行业不了解的用户从这里进全流程地图;老手扫一眼即略过,一行高不抢戏。
 */
export function GuideBanner() {
  return (
    <Link
      href="/app/guide"
      className="dk-card group flex items-center gap-3 px-4 py-3 transition-shadow hover:shadow-md"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
        <Compass className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">第一次做跨境带货？</span>
        <span className="block truncate text-xs text-zinc-500">
          60 秒看懂从开店到回款的全流程；有问题随时问上面的跨境顾问
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600">
        新手指南
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
