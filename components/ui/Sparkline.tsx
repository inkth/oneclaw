import { DELTA_STROKE, deltaDir, type DeltaDir } from "@/lib/ui/tokens";

/** 裸 SVG 迷你折线：用于表格 cell 内的时序趋势，轻量、可内联（不用 recharts）。
 *  方向由首尾值决定，正负取统一涨跌色;数据 < 2 点不渲染。 */
export function Sparkline({
  data,
  width = 64,
  height = 20,
  dir: dirProp,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  dir?: DeltaDir;
  className?: string;
}) {
  if (!data || data.length < 2) return null;

  const dir = dirProp ?? deltaDir(data[data.length - 1] - data[0]);
  const stroke = DELTA_STROKE[dir];

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / span) * h;
    return [x, y] as const;
  });

  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${(width - pad).toFixed(1)},${height - pad}`;
  const gid = `spk-${dir}-${data.length}-${Math.round(data[0])}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
