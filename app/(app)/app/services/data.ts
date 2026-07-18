// 服务板块数据源 —— 从页面组件里抽离，集中维护、便于日后由后端接管。
// 改服务、合作方、联系方式，只改这一个文件，不用再动组件（别写死在 TSX 里）。
//
// 三条原则：
//  ① 合作方非平台背书：标注了 partners 的服务由第三方渠道提供，卡片会打「合作方 · 非平台背书」。
//  ② 可配置：数据全在这里，字段结构按未来能被 Go 后端接管来设计（图标用字符串名、纯可序列化）。
//  ③ 联系直连：点某服务的「预约咨询」，直接展示该服务对应合作方的联系方式（电话/微信/邮箱）。
//     没有合作方的服务（物流/收款/税务等）仍走平台兜底联系方式 CONTACT。

import type { Tone } from "@/lib/ui/tokens";

export type Status = "live" | "beta" | "soon";

export const STATUS_META: Record<Status, { label: string; tone: Tone }> = {
  live: { label: "可预约", tone: "success" },
  beta: { label: "内测中", tone: "warning" },
  soon: { label: "即将上线", tone: "neutral" },
};

// TikTok Shop 主要目标市场。"global" = 与市场无关（如客服、收款），卡片上标注为「全球通用」。
export type Region = "us" | "uk" | "sea" | "mx" | "br" | "eu" | "me" | "global";

export const REGION_LABEL: Record<Region, string> = {
  us: "美国",
  uk: "英国",
  sea: "东南亚",
  mx: "墨西哥",
  br: "巴西",
  eu: "欧洲",
  me: "中东",
  global: "全球通用",
};

// 合作方 = 提供该服务的第三方渠道。「预约咨询」弹窗直接展示其联系方式（非平台背书）。
export type Partner = {
  name: string; // 机构展示名
  note?: string; // 一句话资质 / 定位
  phone?: string; // 电话（可拨打 / 复制）
  wechat?: string; // 微信号（复制添加）
  email?: string; // 邮箱
};

export type Service = {
  label: string;
  desc: string;
  icon: string; // lucide 图标名，组件侧映射为图标组件
  status: Status;
  tags: string[]; // 卖点标签
  regions: Region[]; // 适用市场
  partners?: Partner[]; // 有合作方 → 卡片显示「合作方 · 非平台背书」
};

export type Category = {
  key: string;
  label: string;
  desc: string;
  icon: string; // 分类图标（lucide 名）
  accent: "sky" | "brand" | "emerald"; // 分类色调（表头图标色签）
  services: Service[];
};

// ── 对接配置 ──────────────────────────────────────────────────────────
// 平台兜底联系方式：仅用于「没有合作方」的服务（物流/收款/税务等）。有合作方的服务直接显示合作方联系方式。
export const CONTACT = {
  wecomUrl: "", // 企业微信「联系我」活码链接 → 自动渲染成二维码，扫码即加顾问
  qrImageSrc: "", // 或：客服微信/企微二维码图片，放进 public/ 后填路径，如 "/contact-qr.png"
  wechatId: "", // 备用：客服微信号，弹窗内展示并支持一键复制
  email: "contact@faxianmao.com", // 兜底：始终展示的邮件入口
};

// 合作方名录。联系方式会在对应服务的「预约咨询」弹窗里直接展示。
const YIKE: Partner = {
  name: "宜客跨境",
  note: "TikTok for Business 官方授权一级代理",
  phone: "+86 137 2500 0556",
  email: "2721973630@qq.com",
};
const VINCENT: Partner = {
  name: "Vincent 海外代播",
  note: "TikTok 电商代播 · 团播",
  wechat: "17840717105",
};
const CHAOREN: Partner = {
  name: "潮人跨境",
  note: "全球本土店解决方案服务商",
  email: "Guoge678@gmail.com",
};
const UVA: Partner = {
  name: "鱿鱼 · UVA",
  note: "主角跨境 · 主体入驻与财税合规",
  phone: "+86 189 2523 9734",
};
const DACHONG: Partner = {
  name: "Dachong LLC",
  note: "美东海外仓 · 联系人 Anita Chan",
  phone: "+1 626 525 3281",
  wechat: "1291056817",
  email: "chanchanyinn@gmail.com",
};
const LIPOLIPOO: Partner = {
  name: "LipoLipoo",
  note: "巴西海外仓",
  wechat: "17840717105",
};
const CHENFENG: Partner = {
  name: "晨风",
  note: "5 年跨境服务商 · 多平台本土店入驻",
  wechat: "Gao061818",
  email: "2648269853@qq.com",
};

export const CATEGORIES: Category[] = [
  {
    key: "fulfillment",
    label: "物流履约",
    desc: "把货又快又省地送到买家手里。",
    icon: "Boxes",
    accent: "sky",
    services: [
      {
        label: "智能物流",
        desc: "对接主流头程专线与海外仓渠道，下单前一键比价选最优线路，发出后轨迹自动同步、异常件主动提醒。适合刚起量、还没有固定货代的新卖家。",
        icon: "Truck",
        status: "beta",
        tags: ["多渠道比价", "轨迹同步", "异常提醒"],
        regions: ["us", "uk", "sea", "mx", "eu", "me"],
      },
      {
        label: "海外仓",
        desc: "美东、巴西本地仓资源：一件代发、退货换标、本地尾程配送，旺季不爆仓、时效更稳。适合已有稳定出单、想把物流体验做上去的卖家。",
        icon: "Warehouse",
        status: "live",
        tags: ["一件代发", "退换处理", "本地尾程"],
        regions: ["us", "br"],
        partners: [DACHONG, LIPOLIPOO],
      },
      {
        label: "清关报关",
        desc: "进出口报关与商品合规申报由持牌报关行代理，发货前预审品类资质，避免卡关与扣货。适合带电、美妆等对合规敏感的品类。",
        icon: "PackageCheck",
        status: "soon",
        tags: ["进出口", "合规申报", "品类预审"],
        regions: ["us", "uk", "sea", "eu", "mx", "me"],
      },
    ],
  },
  {
    key: "marketing",
    label: "营销推广",
    desc: "让更多对的人看到你的商品。",
    icon: "TrendingUp",
    accent: "brand",
    services: [
      {
        label: "达人对接",
        desc: "帮你筛选匹配品类的带货达人，代发建联、跟进寄样与佣金方案，进展定期同步，避免寄了样没下文。适合没有海外 BD 团队的卖家。",
        icon: "Users",
        status: "live",
        tags: ["建联寄样", "佣金管理", "进展同步"],
        regions: ["us", "uk", "sea", "mx"],
        partners: [YIKE],
      },
      {
        label: "直播代播",
        desc: "本土主播团队按时段排期代播，含直播脚本、货品讲解与场后数据复盘；也可做短视频真人代拍。适合想试水直播、但还养不起自有主播的卖家。",
        icon: "Radio",
        status: "live",
        tags: ["多时段排期", "脚本支持", "场后复盘"],
        regions: ["sea", "us", "uk"],
        partners: [VINCENT],
      },
      {
        label: "广告开户",
        desc: "TikTok 广告账户开户，GMV Max 计划搭建与托管优化，预算消耗与投产周度汇报。适合自然流量见顶、想放量的店铺。",
        icon: "Megaphone",
        status: "live",
        tags: ["GMV Max", "托管优化", "周度汇报"],
        regions: ["global"],
        partners: [YIKE],
      },
    ],
  },
  {
    key: "finance",
    label: "资金财税",
    desc: "钱安全地收回来，合规地报出去。",
    icon: "Landmark",
    accent: "emerald",
    services: [
      {
        label: "公司与店铺",
        desc: "海外公司主体注册、TikTok Shop / TEMU / Walmart / Amazon 本土店入驻资质材料准备与提审跟进，一站式办妥。适合想从个人店升级为正规主体经营的卖家。",
        icon: "ShieldCheck",
        status: "live",
        tags: ["主体注册", "本土店入驻", "提审跟进"],
        regions: ["us", "uk", "sea", "eu"],
        partners: [CHAOREN, UVA, CHENFENG],
      },
    ],
  },
];

// 适用市场展示文案：含 global 显示「全球通用」，否则列出市场名。
export function regionText(svc: Service): string {
  if (svc.regions.includes("global")) return "全球通用";
  return svc.regions.map((r) => REGION_LABEL[r]).join(" · ");
}
