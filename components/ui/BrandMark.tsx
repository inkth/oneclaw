// 发现猫 品牌标识：全站唯一 Logo 真源。
// 正面猫头剪影——扁宽颅骨 + 双尖耳 + 两只又大又低又分开的镂空眼(幼态比例)。
// 眼睛是 evenodd 挖出的洞(非填色)，故在任意底色上都自动透出背景，整体只需 currentColor。
// favicon(app/icon.svg) 与各处品牌锁定都以此为准,改这里即整站换标。
//
// 改路径前先读这两条，都是实测撞出来的：
// 1) 两耳之间的额头必须保持鼓包、耳尖必须保持尖。一旦把额谷挖深或把耳尖磨圆，
//    裸轮廓立刻读成「束口袋」(两个提手 + 一个袋口 + 一个鼓肚)。
// 2) 耳朵内缘与额头接点处的切线断裂(G1 break)不是瑕疵，是耳根的解剖转折，
//    抹平它猫味就没了。别"修"。
// 想加可爱度只能动眼睛(更大 / 更低 / 更分开)，那不碰轮廓。

/** 猫头轮廓。viewBox 0 0 64 64。 */
const CAT_HEAD =
  "M12 7C14.5 13 17.5 16.5 22 18.5C26.5 17.3 37.5 17.3 42 18.5C46.5 16.5 49.5 13 52 7" +
  "C56 13 59 19 60 26C61 29 61 31 61 34C61 47 48 57 32 57C16 57 3 47 3 34" +
  "C3 31 3 29 4 26C5 19 8 13 12 7Z";

/** 双眼：子路径，靠 evenodd 成为镂空。 */
const CAT_EYES =
  "M14.1 39.4a5.7 5.7 0 1 0 11.4 0a5.7 5.7 0 1 0 -11.4 0Z" +
  "M38.5 39.4a5.7 5.7 0 1 0 11.4 0a5.7 5.7 0 1 0 -11.4 0Z";

/** 完整标记路径(viewBox 0 0 64 64,须配 fill-rule="evenodd")。
 *  给不能用 React 组件的地方复用：app/apple-icon.tsx、app/opengraph-image.tsx
 *  的 ImageResponse 走 Satori,只能吃 <img> 里的 SVG 字符串。
 *  从这里取,标记才不会和 favicon / OG 图各画各的。 */
export const CAT_MARK_PATH = CAT_HEAD + CAT_EYES;

type BrandMarkProps = {
  className?: string;
};

/** 猫头标记。默认 currentColor，放在品牌方块里给白色，放在浅底给品牌色。
 *  眼睛是这个造型里唯一的猫信号来源之一，任何尺寸都不许去掉。 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={CAT_HEAD + CAT_EYES} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

type BrandTileProps = {
  /** 控制方块尺寸 + 圆角；不传默认 h-10 w-10 rounded-2xl。 */
  className?: string;
  /** 标记相对方块的占比 class，默认 78%。方块 ≤20px 时提到 86%,否则圆角吃掉耳尖。 */
  markClassName?: string;
};

/** 品牌方块 + 白色猫标记：app 图标式锁定(侧栏 / 顶栏 / 登录面板)。
 *  Design Language §4/§16：单一强调色实底(去 indigo→fuchsia 三色渐变)。
 *  用字面值 #6E56FF(非 brand 变量)，故在 .app-skin 近黑皮肤下仍保留这一抹电紫。 */
export function BrandTile({ className, markClassName }: BrandTileProps) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center bg-[#6e56ff] text-white shadow-sm " +
        (className ?? "h-10 w-10 rounded-2xl")
      }
    >
      <BrandMark className={markClassName ?? "h-[78%] w-[78%]"} />
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
};

/** 标记 + 「发现猫」字标横向锁定。中文字标走 font-display + 轻微正字距，精致透气。 */
export function BrandLockup({
  className,
  tileClassName,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: BrandLockupProps) {
  return (
    <span className={"inline-flex items-center gap-2.5 " + (className ?? "")}>
      <BrandTile className={tileClassName} markClassName={markClassName} />
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
