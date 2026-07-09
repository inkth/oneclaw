"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fmt, fmtMoney } from "./format";

export type TrendDatum = {
  dt: string; // YYYY-MM-DD
  saleCnt: number; // 当日增量销量
  gmv: number; // 当日增量 GMV(美元)
};

export type TrendSeries = {
  key: string; // data 里的字段名
  label: string; // 图例 / tooltip 名称
  kind: "area" | "line";
  axis: "left" | "right";
  color: string;
  money?: boolean; // 是否按金额格式化
};

// 默认:每日增量销量(面积,左轴)+ GMV(折线,右轴)—— 选品/店铺通用。
const DEFAULT_SERIES: TrendSeries[] = [
  { key: "saleCnt", label: "当日销量", kind: "area", axis: "left", color: "#6e56ff" },
  { key: "gmv", label: "当日 GMV", kind: "line", axis: "right", color: "#64748b", money: true },
];

/** 双轴趋势图。series 可配:面积/折线 × 左/右轴 × 金额格式。 */
export function TrendChart({
  data,
  series = DEFAULT_SERIES,
  empty = "暂无趋势数据",
}: {
  data: Record<string, number | string>[];
  series?: TrendSeries[];
  empty?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        {empty}
      </div>
    );
  }
  const mmdd = (s: string) => (s.length >= 10 ? s.slice(5) : s);
  const leftSeries = series.filter((s) => s.axis === "left");
  const rightSeries = series.filter((s) => s.axis === "right");
  const fmtOf = (money?: boolean) => (v: number) => (money ? fmtMoney(v) : fmt(v));
  const byLabel = new Map(series.map((s) => [s.label, s]));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series
              .filter((s) => s.kind === "area")
              .map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
          <XAxis
            dataKey="dt"
            tickFormatter={mmdd}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
          />
          {leftSeries.length > 0 && (
            <YAxis
              yAxisId="left"
              tickFormatter={fmtOf(leftSeries[0].money)}
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
          )}
          {rightSeries.length > 0 && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={fmtOf(rightSeries[0].money)}
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
          )}
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              fontSize: 12,
              boxShadow: "0 8px 24px -8px rgba(16,14,30,0.12)",
            }}
            labelFormatter={(l) => `日期 ${l as string}`}
            formatter={((value: number, name: string) => {
              const s = byLabel.get(name);
              return [s?.money ? fmtMoney(Number(value)) : fmt(Number(value)), name];
            }) as never}
          />
          {series.map((s) =>
            s.kind === "area" ? (
              <Area
                key={s.key}
                yAxisId={s.axis}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
              />
            ) : (
              <Line
                key={s.key}
                yAxisId={s.axis}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
