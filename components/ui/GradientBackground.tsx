// Designkit workspace 输入框背后的流动极光，1:1 复刻自其生产实现。
//
// 12 个花瓣形 blob 横向等分铺开，高度/纵向偏移交错；每个 blob 内叠四层色
// （桃 → 薄荷 → 蓝 → 丁香），四色以 32s 为周期依次淡入淡出，blob 之间再错开相位，
// 于是整片光晕永远在缓慢换色而不出现同步的「呼吸」。
//
// 视觉全在 globals.css 的 .dk-aura-* 里；这里只负责生成几何与相位。
// Design Language §5 为此开了例外——见 docs/design-language.md「§5.1 输入框光晕」。

/** 每个 blob 的几何：left/width/height/top 均为百分比，取自 Designkit 实测值。 */
const BLOBS = [
  { left: 0, width: 8.34, height: 60, top: 24 },
  { left: 8.33, width: 8.34, height: 68, top: 15 },
  { left: 16.66, width: 8.34, height: 56, top: 27 },
  { left: 24.99, width: 8.34, height: 70, top: 12 },
  { left: 33.32, width: 8.34, height: 58, top: 25 },
  { left: 41.65, width: 8.34, height: 72, top: 11 },
  { left: 49.98, width: 8.34, height: 60, top: 25 },
  { left: 58.31, width: 8.34, height: 68, top: 16 },
  { left: 66.64, width: 8.34, height: 64, top: 18 },
  { left: 74.97, width: 8.34, height: 66, top: 14 },
  { left: 83.3, width: 8.34, height: 62, top: 19 },
  { left: 91.63, width: 8.37, height: 64, top: 17 },
];

// 相位：前 8 个按 -4s 等距铺满 32s 周期，后 4 个插到半拍上（-2.5 / -10.5 / …），
// 避免 12 个 blob 落在同一组节拍点上而产生可察觉的整体脉动。
const PHASES = [0, -4, -8, -12, -16, -20, -24, -28, -2.5, -10.5, -18.5, -26.5];

const TONES = ["peach", "mint", "blue", "lilac"] as const;

/**
 * 放在 composer / hero 背后的极光层。自身即绝对定位，父级需 `relative`。
 * 调用点通常再叠一个 `-z-10` 把它压到输入框之下。
 */
export function DkAura({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={"pointer-events-none " + className}>
      <div className="dk-aura">
        <div className="dk-aura-group">
          {BLOBS.map((b, i) => (
            <span
              key={i}
              className="dk-aura-blob"
              style={
                {
                  left: `${b.left}%`,
                  width: `${b.width}%`,
                  height: `${b.height}%`,
                  top: `${b.top}%`,
                  "--blob-phase": `${PHASES[i]}s`,
                } as React.CSSProperties
              }
            >
              {TONES.map((t) => (
                <span key={t} className={`dk-aura-tone dk-aura-${t}`} />
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
