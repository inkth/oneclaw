// 身份头像：由标识串（邮箱/昵称/ID）确定性生成的抽象图案，不再显示姓名首字。
// 中文昵称取首字会得到「跨」「王」这类孤零零的字，观感廉价；抽象渐变几何在
// Stripe/Linear 一类产品里是默认解，且天然规避了字符集/字宽问题。
//
// 两条约束，改之前先读：
// 1) 全程确定性——配色/构图/渐变 id 都从 seed 的哈希推出，不用 Math.random，
//    否则 SSR 与客户端两次渲染出不同图案会 hydration mismatch。
// 2) 配色是**手挑**的成对色，不是 hsl 随机撒点。随机色相必然撞上黄绿、土褐这类
//    脏色，一颗就把整个界面的质感拉下来。要加新色请整对加，并确认白字/白环压得住。

/** FNV-1a：短串足够均匀，且各端结果一致。 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 同相深浅对（暗 → 中），不是撞色对。
 *  「高级感」在这里 = 窄色相跨度 + 低明度起点：一颗头像只讲一个颜色的深浅，
 *  互补色对（紫配橙那种）会立刻变糖果球。 */
const PALETTE: [string, string][] = [
  ["#1E1B4B", "#4F46E5"], // 靛
  ["#2E1065", "#7C3AED"], // 紫
  ["#4A044E", "#A21CAF"], // 品
  ["#042F2E", "#0D9488"], // 鸭青
  ["#064E3B", "#10B981"], // 松绿
  ["#0C4A6E", "#0EA5E9"], // 天青
  ["#4C0519", "#E11D48"], // 玫瑰
  ["#431407", "#EA580C"], // 赭橙
  ["#0F172A", "#475569"], // 石墨
  ["#172554", "#3B82F6"], // 海蓝
];

/** 四种构图，都在 64×64 圆内裁切；靠 seed 再微调角度/位移，同色不同形。 */
type Composition = 0 | 1 | 2 | 3;

export function IdentityAvatar({
  seed,
  size = 32,
  className = "",
  title,
}: {
  /** 稳定标识串：优先用 id / 邮箱，昵称改名后头像就会变。 */
  seed: string;
  /** 像素直径。 */
  size?: number;
  className?: string;
  title?: string;
}) {
  const h = hash(seed || "anon");
  const [from, to] = PALETTE[h % PALETTE.length];
  // 位移一律用 >>>：>> 会对高位为 1 的哈希算出负数，取模后 comp 变负、四个分支全落空，
  // 结果就是一颗没有图案的纯色球。
  const comp = ((h >>> 8) % 4) as Composition;
  const angle = (h >>> 12) % 360;
  const drift = ((h >>> 20) % 24) - 12; // -12..11
  const uid = `ia${h.toString(36)}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? "头像"}
      className={`shrink-0 rounded-full ${className}`}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        {/* 右下压深：把体积感做成「暗角」而不是「高光」。
            早期版本用的是左上白色 radial，实测直接变成 Web2.0 糖果球，别改回去。 */}
        <radialGradient id={`${uid}h`} cx="72%" cy="78%" r="78%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}c`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}c)`}>
        <rect width="64" height="64" fill={`url(#${uid}g)`} />
        <g transform={`rotate(${angle} 32 32)`}>
          {comp === 0 && (
            // 弧线：偏心粗弧 + 一枚小实心点，形状要能在 24px 下还认得出
            <>
              <circle
                cx={32 + drift}
                cy="32"
                r="23"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.3"
                strokeWidth="8"
                strokeDasharray="72 200"
                strokeLinecap="butt"
              />
              <circle
                cx={32 + drift}
                cy="32"
                r="11"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.24"
                strokeWidth="8"
                strokeDasharray="35 200"
                strokeDashoffset="35"
                strokeLinecap="butt"
              />
            </>
          )}
          {comp === 1 && (
            // 折面：一亮一暗两道斜切，只有一道时在深底上几乎读不出来
            <>
              <path d={`M-12 ${40 + drift} L76 ${8 + drift} L76 -12 L-12 -12 Z`} fill="#fff" fillOpacity="0.22" />
              <path d={`M-12 ${58 + drift} L76 ${30 + drift} L76 76 L-12 76 Z`} fill="#000" fillOpacity="0.2" />
            </>
          )}
          {comp === 2 && (
            // 交叠：两枚圆偏心相交，交集处自然出第三层。
            // 半径别再放大：r 超过 24 时圆边会整个跑到裁切圆外，看起来就是一颗纯色球。
            <>
              <circle cx={18 + drift / 2} cy="42" r="19" fill="#fff" fillOpacity="0.2" />
              <circle cx={44 - drift / 2} cy="24" r="15" fill="#fff" fillOpacity="0.16" />
            </>
          )}
          {comp === 3 && (
            // 棱镜：旋转圆角方 + 内层细框，两层同心才有"被设计过"的样子
            <>
              <rect x={8 + drift / 3} y="8" width="48" height="48" rx="17" fill="#fff" fillOpacity="0.18" />
              <rect
                x={19 + drift / 3}
                y="19"
                width="26"
                height="26"
                rx="10"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.26"
                strokeWidth="3"
              />
            </>
          )}
        </g>

        {/* 猫耳：品牌的一点轻在场，压在抽象图案之上。
            两条硬约束：
            1) 画在旋转组**之外**——耳朵跟着 seed 转就成了随机三角形，不再是耳朵。
            2) 整组统一 opacity，而不是给 fill/stroke 各自设 alpha；描边只为把尖角磨圆，
               分别设 alpha 会在轮廓处叠出一圈更亮的边。
            3) 两耳中间必须留空。内侧底角一旦碰上（第一版是 32.5/31.5），整体立刻读成
               蝴蝶结或字母 M，怎么调透明度都救不回来。 */}
        <g opacity="0.26" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round">
          <path d="M17.5 8 L27 26 L13 26 Z" />
          <path d="M46.5 8 L37 26 L51 26 Z" />
        </g>

        <rect width="64" height="64" fill={`url(#${uid}h)`} />
        {/* 内描边：贴在浅色卡片上时给一圈收边 */}
        <circle cx="32" cy="32" r="31.5" fill="none" stroke="#000" strokeOpacity="0.08" />
      </g>
    </svg>
  );
}
