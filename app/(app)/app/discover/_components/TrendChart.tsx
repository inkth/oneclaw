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

/** 选品详情:每日增量销量(面积)+ GMV(折线,右轴)双轴趋势图。 */
export function TrendChart({ data }: { data: TrendDatum[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
        暂无趋势数据
      </div>
    );
  }
  const mmdd = (s: string) => (s.length >= 10 ? s.slice(5) : s);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="saleFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
          <XAxis
            dataKey="dt"
            tickFormatter={mmdd}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="sale"
            tickFormatter={(v: number) => fmt(v)}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <YAxis
            yAxisId="gmv"
            orientation="right"
            tickFormatter={(v: number) => fmtMoney(v)}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              fontSize: 12,
              boxShadow: "0 8px 24px -8px rgba(16,14,30,0.12)",
            }}
            labelFormatter={(l) => `日期 ${l as string}`}
            formatter={((value: number, name: string) =>
              name === "GMV"
                ? [fmtMoney(Number(value)), "当日 GMV"]
                : [fmt(Number(value)), "当日销量"]) as never}
          />
          <Area
            yAxisId="sale"
            type="monotone"
            dataKey="saleCnt"
            name="销量"
            stroke="#7c3aed"
            strokeWidth={2}
            fill="url(#saleFill)"
          />
          <Line
            yAxisId="gmv"
            type="monotone"
            dataKey="gmv"
            name="GMV"
            stroke="#d946ef"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
