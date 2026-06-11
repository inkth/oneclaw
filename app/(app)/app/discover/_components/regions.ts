// 选品各榜共用的地区配置（TikTok Shop 全部开放站点）。
// 这是国家列表的唯一来源：FilterBar、各 discover 页、参数校验都从这里取，扩国家只改此文件。
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
  | "JP"
  | "IE";

export const REGIONS: Array<{ code: Region; cn: string; flag: string }> = [
  { code: "US", cn: "美国", flag: "🇺🇸" },
  { code: "GB", cn: "英国", flag: "🇬🇧" },
  { code: "ID", cn: "印尼", flag: "🇮🇩" },
  { code: "TH", cn: "泰国", flag: "🇹🇭" },
  { code: "VN", cn: "越南", flag: "🇻🇳" },
  { code: "MY", cn: "马来", flag: "🇲🇾" },
  { code: "PH", cn: "菲律宾", flag: "🇵🇭" },
  { code: "SG", cn: "新加坡", flag: "🇸🇬" },
  { code: "ES", cn: "西班牙", flag: "🇪🇸" },
  { code: "MX", cn: "墨西哥", flag: "🇲🇽" },
  { code: "DE", cn: "德国", flag: "🇩🇪" },
  { code: "FR", cn: "法国", flag: "🇫🇷" },
  { code: "IT", cn: "意大利", flag: "🇮🇹" },
  { code: "BR", cn: "巴西", flag: "🇧🇷" },
  { code: "JP", cn: "日本", flag: "🇯🇵" },
  { code: "IE", cn: "爱尔兰", flag: "🇮🇪" },
];

export const REGION_CODES: Region[] = REGIONS.map((r) => r.code);
