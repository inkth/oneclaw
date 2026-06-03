'use client';

import { useState } from 'react';

interface Props {
  sellingPrice: number;
  commissionRate: number;
}

export function ProfitCalculator({ sellingPrice, commissionRate }: Props) {
  const [sourcingCost, setSourcingCost] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [otherCost, setOtherCost] = useState('');

  const sourcing = parseFloat(sourcingCost) || 0;
  const shipping = parseFloat(shippingCost) || 0;
  const other = parseFloat(otherCost) || 0;

  const platformFee = sellingPrice * 0.05;
  const commission = sellingPrice * commissionRate;
  const totalCost = sourcing + shipping + other + platformFee + commission;
  const profit = sellingPrice - totalCost;
  const profitMargin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <InputField
          label="采购成本 (USD)"
          placeholder="如：5.00"
          value={sourcingCost}
          onChange={setSourcingCost}
        />
        <InputField
          label="运费 (USD)"
          placeholder="如：3.50"
          value={shippingCost}
          onChange={setShippingCost}
        />
        <InputField
          label="其他成本 (USD)"
          placeholder="如：1.00"
          value={otherCost}
          onChange={setOtherCost}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <ResultItem label="售价" value={`$${sellingPrice.toFixed(2)}`} />
        <ResultItem label="平台费 (5%)" value={`$${platformFee.toFixed(2)}`} muted />
        <ResultItem label={`佣金 (${(commissionRate * 100).toFixed(0)}%)`} value={`$${commission.toFixed(2)}`} muted />
        <ResultItem label="总成本" value={`$${totalCost.toFixed(2)}`} muted />
        <ResultItem
          label="预估利润"
          value={`$${profit.toFixed(2)}`}
          highlight={profit > 0 ? 'green' : profit < 0 ? 'red' : undefined}
          sub={`${profitMargin.toFixed(1)}% 利润率`}
        />
      </div>
    </div>
  );
}

function InputField({
  label, placeholder, value, onChange,
}: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500 block mb-1">{label}</label>
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
      />
    </div>
  );
}

function ResultItem({
  label, value, muted, highlight, sub,
}: {
  label: string; value: string; muted?: boolean; highlight?: 'green' | 'red'; sub?: string;
}) {
  let valueClass = 'text-sm font-semibold';
  if (muted) valueClass += ' text-zinc-500';
  if (highlight === 'green') valueClass += ' text-green-600 dark:text-green-400';
  if (highlight === 'red') valueClass += ' text-red-600 dark:text-red-400';

  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 px-3 py-2">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={valueClass}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  );
}
