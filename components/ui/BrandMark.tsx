// 发现猫 品牌标识：全站唯一 Logo 真源。
// 极简单线猫标记(monoline)——两只尖耳 + 圆脸 + 两只极简眼睛，currentColor 描边，
// 极简到只剩「头部轮廓 + 双耳 + 双眼」(无鼻/无胡须),任意尺寸缩放清晰。
// favicon(app/icon.svg) 与各处品牌锁定都以此为准,改这里即整站换标。

type BrandMarkProps = {
  className?: string;
  /** 描边粗细(24 视窗单位)。小尺寸可调粗。 */
  strokeWidth?: number;
};

/** 单线猫标记。默认 currentColor，放在渐变方块里给白色，放在浅底给品牌色。 */
export function BrandMark({ className, strokeWidth = 1.6 }: BrandMarkProps) {
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
      {/* 双眼(极简两点) */}
      <circle cx="9.6" cy="12.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="12.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

type BrandTileProps = {
  /** 控制方块尺寸 + 圆角；不传默认 h-10 w-10 rounded-2xl。 */
  className?: string;
  /** 标记相对方块的占比 class，默认 70%。 */
  markClassName?: string;
  strokeWidth?: number;
};

/** 渐变方块 + 白色猫标记：app 图标式锁定(侧栏 / 顶栏 / 登录面板)。
 *  渐变用 Tailwind 调色板(非 brand 变量)，故在 .app-skin 近黑皮肤下仍保留这一抹电紫。 */
export function BrandTile({
  className,
  markClassName,
  strokeWidth = 1.7,
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
};

/** 标记 + 「发现猫」字标横向锁定。中文字标走 font-display + 轻微正字距，精致透气。 */
export function BrandLockup({
  className,
  tileClassName,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
  strokeWidth,
}: BrandLockupProps) {
  return (
    <span className={"inline-flex items-center gap-2.5 " + (className ?? "")}>
      <BrandTile
        className={tileClassName}
        markClassName={markClassName}
        strokeWidth={strokeWidth}
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
