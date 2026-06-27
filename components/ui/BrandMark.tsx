// 发现猫 品牌标识：全站唯一 Logo 真源。
// 极简单线猫标记(monoline)——两只尖耳 + 圆脸 + 双眼 + 胡须，currentColor 描边，
// 任意尺寸缩放清晰。favicon(app/icon.svg) 与各处品牌锁定都以此为准，改这里即整站换标。

type BrandMarkProps = {
  className?: string;
  /** 描边粗细(24 视窗单位)。小尺寸可调粗。 */
  strokeWidth?: number;
  /** 是否画胡须。极小尺寸(favicon 16px)可关，避免发糊。 */
  whiskers?: boolean;
};

/** 单线猫标记。默认 currentColor，放在渐变方块里给白色，放在浅底给品牌色。 */
export function BrandMark({
  className,
  strokeWidth = 1.6,
  whiskers = true,
}: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* 头部轮廓 + 双耳(一笔成形) */}
      <path
        d="M4.6 9.4 4.1 3.4 8.9 6.5 Q12 7.8 15.1 6.5 L19.9 3.4 19.4 9.4 C19.4 15.5 16.5 19 12 20 C7.5 19 4.6 15.5 4.6 9.4 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 双眼 */}
      <circle cx="9.5" cy="11.9" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11.9" r="1.05" fill="currentColor" stroke="none" />
      {/* 鼻(小三角) */}
      <path
        d="M12 14.9 11.2 14.05 12.8 14.05 Z"
        fill="currentColor"
        stroke="none"
      />
      {/* 胡须(各侧两根，向外舒展) */}
      {whiskers && (
        <path
          d="M10 14.2 6 13.3 M10.1 15.6 6.4 16.3 M14 14.2 18 13.3 M13.9 15.6 17.6 16.3"
          stroke="currentColor"
          strokeWidth={strokeWidth * 0.82}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

type BrandTileProps = {
  /** 控制方块尺寸 + 圆角；不传默认 h-10 w-10 rounded-2xl。 */
  className?: string;
  /** 标记相对方块的占比 class，默认 70%。 */
  markClassName?: string;
  strokeWidth?: number;
  whiskers?: boolean;
};

/** 渐变方块 + 白色猫标记：app 图标式锁定(侧栏 / 顶栏 / 登录面板)。
 *  渐变用 Tailwind 调色板(非 brand 变量)，故在 .app-skin 近黑皮肤下仍保留这一抹电紫。 */
export function BrandTile({
  className,
  markClassName,
  strokeWidth = 1.7,
  whiskers = true,
}: BrandTileProps) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-sm " +
        (className ?? "h-10 w-10 rounded-2xl")
      }
    >
      <BrandMark
        className={markClassName ?? "h-[70%] w-[70%]"}
        strokeWidth={strokeWidth}
        whiskers={whiskers}
      />
    </span>
  );
}

type BrandLockupProps = {
  className?: string;
  tileClassName?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  /** 关掉字标只显标记。 */
  showWordmark?: boolean;
  strokeWidth?: number;
  whiskers?: boolean;
};

/** 标记 + 「发现猫」字标横向锁定。中文字标走 font-display + 轻微正字距，精致透气。 */
export function BrandLockup({
  className,
  tileClassName,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
  strokeWidth,
  whiskers,
}: BrandLockupProps) {
  return (
    <span className={"inline-flex items-center gap-2.5 " + (className ?? "")}>
      <BrandTile
        className={tileClassName}
        markClassName={markClassName}
        strokeWidth={strokeWidth}
        whiskers={whiskers}
      />
      {showWordmark && (
        <span
          className={
            "font-display font-semibold tracking-[0.06em] text-ink " +
            (wordmarkClassName ?? "text-lg")
          }
        >
          发现猫
        </span>
      )}
    </span>
  );
}
