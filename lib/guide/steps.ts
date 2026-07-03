import {
  BarChart3,
  Clapperboard,
  LayoutList,
  Megaphone,
  Search,
  Store,
  type LucideIcon,
} from "lucide-react";
import { type ComposerKind } from "@/app/(app)/app/agent-composer";

/**
 * 新手指南「跨境带货全流程地图」的预制内容源。
 * 认知内容对所有新手是同一套,预制一版(可控、瞬开、零 token),
 * LLM 只负责地图底部「结合你的情况排路线」的个性化收尾。
 * 成本/周期是美区 TikTok Shop 的粗略区间,给量级感,不是报价。
 */
export type GuideStep = {
  key: string;
  title: string;
  /** 这一步在干什么,一句人话。 */
  tagline: string;
  /** 大概花多少钱(区间,给量级感)。 */
  cost: string;
  /** 大概多久。 */
  cycle: string;
  /** 新手最常踩的坑。 */
  pitfalls: string[];
  /** 这一步会撞上的行业黑话。 */
  terms: { term: string; def: string }[];
  /** 谁来干:cat=发现猫能替你干(挂接力按钮),you=得你自己来(给指引,不装能干)。 */
  owner: "you" | "cat";
  ownerNote: string;
  /** owner=cat 时:接力到哪个胶囊、预填什么指令(「」为占位,光标会落进去)。 */
  agent?: ComposerKind;
  relayPrompt?: string;
  icon: LucideIcon;
};

export const GUIDE_STEPS: GuideStep[] = [
  {
    key: "shop",
    title: "开店入驻",
    tagline: "在 TikTok Shop 注册一家跨境店,拿到卖货资格。",
    cost: "保证金视类目而定,一般 $0-500",
    cycle: "资料齐全 1-7 天过审",
    pitfalls: [
      "美区对中国卖家的入驻路径(自运营/全托管/本土店)政策变化快,先看官方最新入驻要求再准备资料",
      "不要买现成账号——关联封店后货款一起冻结",
    ],
    terms: [
      { term: "全托管", def: "你只管供货,平台管定价、流量和履约;赚得稳但薄" },
      { term: "POP 自运营", def: "自己开店自己运营,定价和玩法都归你;本指南默认这条路" },
    ],
    owner: "you",
    ownerNote: "注册、资质、绑收款得你自己来,发现猫帮不了这步",
    icon: Store,
  },
  {
    key: "select",
    title: "选品",
    tagline: "找到有需求、有毛利、适合短视频展示的货,这一步决定后面所有步骤的上限。",
    cost: "样品费 $20-100",
    cycle: "1-3 天定候选,别超过一周",
    pitfalls: [
      "只看销量不看毛利:扣掉货本、物流、佣金、退货,毛利低于 35% 基本白干",
      "碰侵权品(大牌同款、影视 IP):店直接没了",
    ],
    terms: [
      { term: "蓝海品", def: "需求在涨、竞争还没挤满的品;反义词是人挤人的红海" },
      { term: "佣金率", def: "达人帮你带货抽的分成,美区常见 10-20%" },
      { term: "达人带货", def: "让 TikTok 创作者挂你的商品链接出视频,按佣金分成" },
    ],
    owner: "cat",
    ownerNote: "发现猫接的就是这步:基于 EchoTik 真实榜单帮你筛",
    agent: "ANALYST",
    relayPrompt:
      "我是刚起步的新手,帮我从美国热销榜挑 3 个适合新手的品:轻小好发货、毛利 40%+、不侵权、适合短视频展示",
    icon: Search,
  },
  {
    key: "listing",
    title: "上架 Listing",
    tagline: "把商品页写好:标题、卖点、主图,让点进来的人愿意下单。",
    cost: "基本零成本",
    cycle: "半天一个品",
    pitfalls: [
      "中文文案机翻上架:老外看得懂但不想买,要用当地人的说法写卖点",
      "主图带水印、堆促销字被判违规下架",
    ],
    terms: [
      { term: "Listing", def: "商品详情页整套内容:标题 + 卖点 + 图 + 描述" },
      { term: "五点卖点", def: "商品页最显眼的 5 条 bullet,一条讲一个买它的理由" },
    ],
    owner: "cat",
    ownerNote: "发现猫替你写:标题、卖点、A+ 结构、主图方案一次出",
    agent: "LISTING",
    relayPrompt:
      "为「」生成 TikTok Shop 美区 Listing:标题、五点卖点、A+ 结构、主图方案,语气按美国消费者习惯来",
    icon: LayoutList,
  },
  {
    key: "video",
    title: "做视频引流",
    tagline: "TikTok Shop 的流量主要靠短视频,商品挂在视频里被刷到才有单。",
    cost: "AI 出片几乎零成本,实拍另算",
    cycle: "每天 1-3 条,持续发",
    pitfalls: [
      "拍成硬广:开头 3 秒没钩子直接被划走,要像真人分享不像广告",
      "一条爆了不总结为什么爆,复制不出第二条",
    ],
    terms: [
      { term: "钩子", def: "开头 3 秒留住人的那句话/画面,决定这条视频的生死" },
      { term: "UGC 风", def: "拍得像普通用户随手分享,不像品牌广告,转化普遍更好" },
      { term: "CTA", def: "让观众行动的收尾:点小黄车、领券、下单" },
    ],
    owner: "cat",
    ownerNote: "发现猫替你干:一句话出一条带货短视频,也能拆解别人的爆款",
    agent: "DIRECTOR",
    relayPrompt: "为「」生成一条 UGC 风格的 TikTok 带货短视频,真人开箱口播感,面向美国市场",
    icon: Clapperboard,
  },
  {
    key: "ads",
    title: "投放放大",
    tagline: "视频有自然流量的苗头后,花钱买量把它放大。",
    cost: "测试期每天 $20-50,别一上来砸大的",
    cycle: "单次测试跑 3-7 天再下结论",
    pitfalls: [
      "一上来日预算几百刀:先小额测出能跑正的素材,再加预算",
      "跑一天就判生死:算法需要 3 天左右学习期,当天 ROI 说明不了什么",
    ],
    terms: [
      { term: "GMV Max", def: "TikTok 的智能投放产品,按成交目标自动买量,新手主要用它" },
      { term: "ROI / ROAS", def: "花 1 块广告费赚回几块;跑不到 2 以上一般在亏" },
    ],
    owner: "you",
    ownerNote: "投放在 TikTok 广告后台你自己操作,跑完的报表交给发现猫复盘",
    icon: Megaphone,
  },
  {
    key: "review",
    title: "复盘迭代",
    tagline: "看数据决定每条素材、每个品是停、是改、还是加投,然后回到选品/做视频循环。",
    cost: "零成本,最值钱的一步",
    cycle: "每周至少一次",
    pitfalls: [
      "凭感觉调:亏钱的素材舍不得停,赚钱的不敢加,要让数据说话",
      "只看大盘 ROI 不归因到单条素材,不知道钱亏在哪条上",
    ],
    terms: [
      { term: "止损线", def: "提前定好亏到多少就停,不跟亏钱素材耗" },
      { term: "素材归因", def: "把成交和花费拆到每条视频头上,找出真正能打的那条" },
    ],
    owner: "cat",
    ownerNote: "发现猫替你干:上传投放报表,直接给停/改/加投的建议",
    agent: "REVIEW",
    icon: BarChart3,
  },
];
