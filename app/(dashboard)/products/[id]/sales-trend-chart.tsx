'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { ProductTrendPoint } from '@/lib/echotik/types';

interface Props {
  data: ProductTrendPoint[];
}

export function SalesTrendChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => a.dt.localeCompare(b.dt));
  const chartData = sorted.map(d => ({
    date: d.dt.slice(5),
    sales: d.total_sale_1d_cnt,
    gmv: Math.round(d.total_sale_gmv_1d_amt),
  }));

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value, name) => {
              const v = Number(value);
              return [name === 'gmv' ? `$${v.toLocaleString()}` : v.toLocaleString(), name === 'gmv' ? 'GMV' : '销量'];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="left" type="monotone" dataKey="sales" name="日销量" stroke="#f97316" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="gmv" name="日 GMV ($)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
