"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Flame, TrendingUp, Star } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { REGIONS, type Region } from "./regions";

export type { Region };
export { REGIONS };

const RANK_TYPES: Array<{ v: number; cn: string; icon: React.ComponentType<{ className?: string }> }> = [
  { v: 1, cn: "热销", icon: Flame },
  { v: 2, cn: "上升", icon: TrendingUp },
  { v: 3, cn: "新品", icon: Star },
];

// 店铺/达人/视频榜的排序字段只接受 1=销量 / 2=GMV。
const FIELDS: Array<{ v: number; cn: string }> = [
  { v: 1, cn: "销量" },
  { v: 2, cn: "GMV" },
];

/** 选品三榜共用的筛选栏:地区 + 榜单类型 + 排序字段,改动 URL query 触发 SSR 重取。 */
export function FilterBar({
  basePath,
  region,
  rankType,
  field,
}: {
  basePath: string;
  region: Region;
  rankType: number;
  field: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(patch: { region?: Region; rank_type?: number; field?: number }) {
    const p = new URLSearchParams();
    p.set("region", patch.region ?? region);
    p.set("rank_type", String(patch.rank_type ?? rankType));
    p.set("field", String(patch.field ?? field));
    startTransition(() => router.push(`${basePath}?${p.toString()}`));
  }

  return (
    <div
      className={`rounded-xl border border-zinc-200/80 bg-white px-5 py-4 divide-y divide-zinc-100 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <Row label={<><Globe className="h-3.5 w-3.5" />国家/地区</>}>
        {REGIONS.map((r) => (
          <Pill key={r.code} active={region === r.code} onClick={() => navigate({ region: r.code })}>
            <span className="mr-1">{r.flag}</span>
            {r.cn}
          </Pill>
        ))}
      </Row>
      <Row label="榜单类型">
        {RANK_TYPES.map((rt) => {
          const Icon = rt.icon;
          return (
            <Pill key={rt.v} active={rankType === rt.v} onClick={() => navigate({ rank_type: rt.v })}>
              <Icon className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
              {rt.cn}
            </Pill>
          );
        })}
      </Row>
      <Row label="排序">
        {FIELDS.map((f) => (
          <Pill key={f.v} active={field === f.v} onClick={() => navigate({ field: f.v })}>
            {f.cn}
          </Pill>
        ))}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="inline-flex shrink-0 items-center gap-1 pt-1.5 text-sm font-semibold text-zinc-800 w-[84px] whitespace-nowrap">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1.5">{children}</div>
    </div>
  );
}
