// 选品各榜共用的地区配置（TikTok Shop 开放站点 ∩ EchoTik 数据源支持站点）。
// 这是国家列表的唯一来源：FilterBar、各 discover 页、参数校验、做视频目标市场都从这里取，扩国家只改此文件。
// 注意：IE(爱尔兰)是 TikTok Shop 站点但 EchoTik 不支持（整站 code 500）,2026-07 已移除;
// EchoTik 还支持 SA(沙特),前端未开，要加先确认 TikTok Shop 已开站。
export type Region =
  | "US"
  | "GB"
  | "ID"
  | "TH"
  | "VN"
  | "MY"
  | "PH"
  | "SG"
  | "ES"
  | "MX"
  | "DE"
  | "FR"
  | "IT"
  | "BR"
  | "JP";

// lang 是该市场短视频口播语言的中文名，仅做选择前的下拉预览;
// 生成侧权威映射在 Go 端 server/internal/service/region_lang.go(regionVoices),
// 脚本生成后的展示一律用后端写进任务 metadata 的 voiceLang。
export const REGIONS: Array<{ code: Region; cn: string; flag: string; lang: string }> = [
  { code: "US", cn: "美国", flag: "🇺🇸", lang: "英语" },
  { code: "GB", cn: "英国", flag: "🇬🇧", lang: "英语" },
  { code: "ID", cn: "印尼", flag: "🇮🇩", lang: "印尼语" },
  { code: "TH", cn: "泰国", flag: "🇹🇭", lang: "泰语" },
  { code: "VN", cn: "越南", flag: "🇻🇳", lang: "越南语" },
  { code: "MY", cn: "马来西亚", flag: "🇲🇾", lang: "马来语" },
  { code: "PH", cn: "菲律宾", flag: "🇵🇭", lang: "菲律宾语" },
  { code: "SG", cn: "新加坡", flag: "🇸🇬", lang: "英语" },
  { code: "ES", cn: "西班牙", flag: "🇪🇸", lang: "西班牙语" },
  { code: "MX", cn: "墨西哥", flag: "🇲🇽", lang: "西班牙语" },
  { code: "DE", cn: "德国", flag: "🇩🇪", lang: "德语" },
  { code: "FR", cn: "法国", flag: "🇫🇷", lang: "法语" },
  { code: "IT", cn: "意大利", flag: "🇮🇹", lang: "意大利语" },
  { code: "BR", cn: "巴西", flag: "🇧🇷", lang: "葡萄牙语" },
  { code: "JP", cn: "日本", flag: "🇯🇵", lang: "日语" },
];

export const REGION_CODES: Region[] = REGIONS.map((r) => r.code);

export const REGION_LANG: Record<Region, string> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r.lang]),
) as Record<Region, string>;
