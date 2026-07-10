import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { CAT_MARK_PATH } from "@/components/ui/BrandMark";

// 分享到微信 / X 时的品牌卡片。此前缺失,链接是一张白板。
export const alt = "发现猫 · TikTok Shop 出海全链路";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori 自带字体不含中文,不喂字体「发现猫」会渲染成豆腐块。
// 完整思源黑体简体分片 1.5MB,超过 ImageResponse 的 500KB 打包上限,
// 故 app/_brand/wordmark-600.ttf 是只含本图用到的字的子集(21KB)。
// 改这张图的文案 = 要重新子集化,否则新字渲染不出来。
const FONT = join(process.cwd(), "app/_brand/wordmark-600.ttf");

// Satori 不认内联 <svg>,只能吃 <img> 里的 SVG。必须 base64:
// resvg 解不了 encodeURIComponent 过的 data URI(svgload_buffer 直接失败)。
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="104" height="104"><path d="${CAT_MARK_PATH}" fill="#fff" fill-rule="evenodd"/></svg>`;
const markSrc = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;

export default async function OpengraphImage() {
  const font = await readFile(FONT);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#f6f7fa",
          padding: "0 96px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 148,
              height: 148,
              borderRadius: 36,
              background: "#6e56ff",
            }}
          >
            <img width={104} height={104} src={markSrc} alt="" />
          </div>
          <div style={{ display: "flex", fontSize: 76, color: "#222326" }}>
            发现猫
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 52,
            color: "#222326",
          }}
        >
          选品 · 做视频 · 投放复盘
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 34,
            color: "#6e56ff",
          }}
        >
          TikTok Shop 出海全链路
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Noto Sans SC", data: font, weight: 600, style: "normal" },
      ],
    },
  );
}
