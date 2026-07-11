import { ImageResponse } from "next/og";
import { CAT_MARK_PATH } from "@/components/ui/BrandMark";

// iOS「添加到主屏」图标。此前缺失,Safari 只能拿 32px 的 favicon 硬撑。
// 不加圆角：iOS 自己会套 squircle 蒙版，我们画圆角就会被裁两次。
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Satori 不认内联 <svg>,只能吃 <img> 里的 SVG。必须 base64:
// resvg 解不了 encodeURIComponent 过的 data URI(svgload_buffer 直接失败)。
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="132" height="132"><path d="${CAT_MARK_PATH}" fill="#fff" fill-rule="evenodd"/></svg>`;
const markSrc = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6e56ff",
        }}
      >
        <img width={132} height={132} src={markSrc} alt="" />
      </div>
    ),
    size,
  );
}
