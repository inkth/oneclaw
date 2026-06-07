// 选品各榜共用的地区配置。与 Go 后端 discover 支持的 6 国对齐。
export type Region = "US" | "GB" | "ID" | "TH" | "VN" | "MY";

export const REGIONS: Array<{ code: Region; cn: string; flag: string }> = [
  { code: "US", cn: "美国", flag: "🇺🇸" },
  { code: "GB", cn: "英国", flag: "🇬🇧" },
  { code: "ID", cn: "印尼", flag: "🇮🇩" },
  { code: "TH", cn: "泰国", flag: "🇹🇭" },
  { code: "VN", cn: "越南", flag: "🇻🇳" },
  { code: "MY", cn: "马来", flag: "🇲🇾" },
];

export const REGION_CODES: Region[] = REGIONS.map((r) => r.code);
