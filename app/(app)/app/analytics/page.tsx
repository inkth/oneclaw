import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Database,
  Eye,
  Gauge,
  Grid2x2,
  MousePointerClick,
  Filter,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableWrap, THead, Th, Tr, Td } from "@/components/ui/Table";
import { type Tone } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

export const metadata = { title: "复盘 · GMVMax 数据诊断 · OneClaw" };

// ── 区块标题：图标 + 步骤序号 + 标题 + 说明 ──────────────────────────
function SectionHeading({
  step,
  icon: Icon,
  title,
  desc,
}: {
  step: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium tabular-nums text-indigo-500">{step}</span>
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}

// ── 1. 数据准备：导出报表 + 必备字段 ────────────────────────────────
const REQUIRED_FIELDS = [
  { label: "Cost 消耗", hint: "广告花费" },
  { label: "GMV 成交金额", hint: "Gross Revenue" },
  { label: "ROI 投产比", hint: "目标值基准" },
  { label: "Impressions 曝光", hint: "算 CTR 用" },
  { label: "Clicks 点击", hint: "算 CTR 用" },
  { label: "SKU Orders 订单", hint: "算 CVR 用" },
  { label: "完播率 2s / 6s / 100%", hint: "钩子与留存" },
  { label: "Video Title / Creative ID", hint: "内容分析用" },
];

// 象限卡的柔和底色（Tailwind 需要字面量类名，故显式映射，不在运行时拼接）。
const QUADRANT_BG: Record<Tone, string> = {
  brand: "border-indigo-100 bg-indigo-50/40",
  neutral: "border-zinc-200/80 bg-zinc-50/60",
  success: "border-emerald-100 bg-emerald-50/40",
  warning: "border-amber-100 bg-amber-50/40",
  danger: "border-rose-100 bg-rose-50/40",
  info: "border-sky-100 bg-sky-50/40",
  violet: "border-violet-100 bg-violet-50/40",
  fuchsia: "border-fuchsia-100 bg-fuchsia-50/40",
};

// ── 3. 象限分析：Cost × ROI 四象限 ────────────────────────────────
const QUADRANTS: {
  name: string;
  en: string;
  cond: string;
  strategy: string;
  tone: Tone;
}[] = [
  {
    name: "潜力素材",
    en: "Potentials",
    cond: "低消耗 · 高 ROI",
    strategy: "被系统忽视的遗珠，复制计划单独放量测试",
    tone: "info",
  },
  {
    name: "明星素材",
    en: "Winners",
    cond: "高消耗 · 高 ROI",
    strategy: "交给系统自动跑，或手动加推扩量",
    tone: "success",
  },
  {
    name: "长尾素材",
    en: "Others",
    cond: "低消耗 · 低 ROI",
    strategy: "数据量太小、暂无统计意义，忽略",
    tone: "neutral",
  },
  {
    name: "浪费素材",
    en: "Bleeders",
    cond: "高消耗 · 低 ROI",
    strategy: "立即关停或降权——复盘第一优先级，重点揪出来",
    tone: "danger",
  },
];

// ── 4. 漏斗诊断：曝光 → 完播 → 点击 → 转化 → 收益 ───────────────────
const FUNNEL = [
  { icon: Eye, label: "曝光", metric: "Impressions" },
  { icon: Activity, label: "完播", metric: "2s / 6s 播放率" },
  { icon: MousePointerClick, label: "点击", metric: "CTR" },
  { icon: ShoppingCart, label: "转化", metric: "CVR" },
  { icon: Target, label: "收益", metric: "CPA · ROI" },
];

// ── 5. 三大典型问题：诊断与对策 ───────────────────────────────────
const PROBLEMS: {
  title: string;
  signal: string;
  tone: Tone;
  cases: { when: string; verdict: string; action: string }[];
}[] = [
  {
    title: "有消耗无转化",
    signal: "Cost > 0，订单 = 0，转化率 = 0；曝光、点击、2s 完播看似正常",
    tone: "danger",
    cases: [
      {
        when: "高点击率 + 低完播率",
        verdict: "「标题党」信号：前 3 秒钩子吸睛，但内容与产品弱相关，点击源于好奇而非购买意图",
        action: "立即优化创意，让内容与产品强相关、真实反映价值",
      },
      {
        when: "点击率与完播率都正常",
        verdict: "流量质量没问题，断裂在点击之后的下游环节",
        action: "全力优化落地页：优先检查加载速度与首图",
      },
    ],
  },
  {
    title: "有转化但 ROI 低",
    signal: "有订单有收入，但 ROI < 目标值；本质是 CPA 过高。CPA ≈ (CPM/1000) ÷ (CTR × CVR)",
    tone: "warning",
    cases: [
      {
        when: "CTR 低 + CVR 正常",
        verdict: "素材吸引力是瓶颈：系统要付更多曝光才换来一次点击，推高 CPA",
        action: "重点打磨前 3 秒钩子与内容节奏，提升 CTR",
      },
      {
        when: "CTR 正常 + CVR 低",
        verdict: "转化环节是瓶颈：能吸引点击，但落地页/产品说服不了用户",
        action: "优化落地页、价格、促销、用户评价；或提客单价向高毛利倾斜",
      },
      {
        when: "CTR 低 + CVR 也低",
        verdict: "全链路问题：流量不精准且承接不住",
        action: "先优化素材解决流量来源，再优化落地页解决承接",
      },
    ],
  },
  {
    title: "消耗慢，量起不来",
    signal: "曝光低、点击低、消耗慢，其余指标因样本太小缺乏统计意义",
    tone: "info",
    cases: [
      {
        when: "CTR / 2s 完播显著低于基准",
        verdict: "素材竞争力不足：CTR 低于行业基准（如 0.5%）即可断定是素材问题",
        action: "大刀阔斧换素材：做 3-5 条新视频，主攻前 2 秒钩子",
      },
      {
        when: "放宽 ROI 目标后消耗变快",
        verdict: "ROI 目标设得过高，系统在约束下找不到足够达标用户，不敢花钱",
        action: "小幅放宽 ROI 目标（如 3.0 → 2.5），让系统先跑起来",
      },
      {
        when: "每日预算过低",
        verdict: "算法采取保守策略以免超支，容易错过优质流量",
        action: "适当提高预算，给算法足够的探索空间",
      },
    ],
  },
];

// ── 6. Gemini Prompt 模板 ─────────────────────────────────────────
const ANALYSIS_PROMPT = `角色设定：你是一位资深的 TikTok 投放专家和数据分析师。
任务：分析我上传的 TikTok GMV Max 广告数据文件，请用 Python 代码进行计算，不要凭空猜测。

分析维度：
1. 全局健康度扫描（Health Check）
   计算大盘 ROI、平均 CTR、平均 CVR，作为后续分析的基准线（Baseline）。

2. 象限分析（Quadrant Analysis）—— 最核心的步骤
   按 Cost（X 轴）与 ROI（Y 轴）把视频分为四类，列出具体 Video ID 与达人名称：
   · 明星素材（高消耗 + 高 ROI）：交给系统自动跑或手动加推
   · 浪费素材（高消耗 + 低 ROI）：立即关停或降权——请重点把这些找出来！
   · 潜力素材（低消耗 + 高 ROI）：被系统忽视的遗珠，复制计划单独测试
   · 长尾素材（低消耗 + 低 ROI）：忽略

3. 漏斗诊断（Funnel Diagnosis）
   对「浪费素材」进一步分析原因：
   · 高 CTR + 低 CVR：视频吸引人但产品不匹配，或是标题党
   · 低 CTR + 高 CVR：人群精准但素材前 3 秒不够吸引人
   并计算「2 秒完播率」与「ROI」的相关系数。

4. 创意深度挖掘（Creative Insight）
   · 关键词提取：高 ROI 视频标题的共性关键词（#fyp、Free Shipping、特定价格等）
   · 完播率对比：高/低 ROI 视频的 2s、6s 完播率差异，高转化是否在前 6 秒留住更多人
   · 达人分析：哪个达人平均 ROI 最高？哪个靠低价换量（单量大但 ROI 低）？

输出要求：
请生成一份 Markdown 表格形式的「优化行动清单」，包含以下列：
Video ID / Title ｜ 当前问题 ｜ 建议操作 ｜ 优先级（P0 紧急 / P1 重要）`;

const VISION_PROMPT = `我额外上传了 Video A（高 ROI）和 Video B（低 ROI）的视频文件。
除了数据之外，请从视觉层面分析：
Video A 做对了什么？Video B 的前 3 秒有什么问题导致用户流失？`;

// ── 7. 行动清单示例 ──────────────────────────────────────────────
const ACTION_SAMPLE: { id: string; problem: string; action: string; priority: "P0" | "P1" }[] = [
  { id: "VID_8842 · 早晨厨房", problem: "高耗低效（Bleeder）", action: "立即关停，预算转给 VID_9011", priority: "P0" },
  { id: "VID_7310 · 露营场景", problem: "高 CTR 低 CVR · 流量虚高", action: "改前 3 秒、强化产品卖点，落地页换首图", priority: "P0" },
  { id: "VID_9011 · 健身房静音", problem: "低耗高 ROI（Potential）", action: "复制计划单独放量测试", priority: "P1" },
  { id: "VID_6622 · 知识科普", problem: "CTR 低于基准 · 起量慢", action: "重剪前 2 秒钩子，套用 Trending Audio", priority: "P1" },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="复盘"
        badge={<Badge tone="brand" icon={<Sparkles className="h-3 w-3" />}>Gemini 3 Pro 驱动</Badge>}
        description="把 GMVMax 广告报表交给 Gemini 3 Pro：象限分诊、漏斗归因、素材迭代，一套可复制的复盘 SOP，让每一分广告费都花在能转化的素材上。"
      />

      {/* 1 · 数据准备 */}
      <section className="space-y-4">
        <SectionHeading
          step="STEP 1"
          icon={Database}
          title="导出数据 · Creative Hub"
          desc="在 TikTok Shop 后台 → GMV Max 创意中心，导出 Creative Analysis / Video Performance 报表（CSV / Excel）。导出前确认包含以下字段，缺字段会让 Gemini 算不出关键指标。"
        />
        <Card>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {REQUIRED_FIELDS.map((f) => (
              <div
                key={f.label}
                className="rounded-lg border border-zinc-200/80 bg-zinc-50/60 px-3 py-2.5"
              >
                <div className="text-sm font-medium text-zinc-800">{f.label}</div>
                <div className="mt-0.5 text-2xs text-zinc-400">{f.hint}</div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* 2 · 健康度基线 */}
      <section className="space-y-4">
        <SectionHeading
          step="STEP 2"
          icon={Gauge}
          title="健康度扫描 · 建立基线"
          desc="先算出大盘 ROI、平均 CTR、平均 CVR、平均完播率，作为后续所有判断的基准线（Baseline）。下方为示例数值，接入数据后将自动计算。"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Target, label: "大盘 ROI", value: "2.8", hint: "目标 ≥ 3.0" },
            { icon: MousePointerClick, label: "平均 CTR", value: "1.2%", hint: "基准 ~0.5%" },
            { icon: ShoppingCart, label: "平均 CVR", value: "3.6%", hint: "整体 SKU 转化" },
            { icon: Activity, label: "平均 2s 完播", value: "41%", hint: "钩子留存" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-200/80 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                  <s.icon className="h-4 w-4" />
                </div>
                <Badge tone="neutral">示例</Badge>
              </div>
              <div className="mt-5 text-2xl font-semibold tabular-nums text-zinc-900">{s.value}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{s.label}</div>
              <div className="mt-1 text-2xs text-zinc-400">{s.hint}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 3 · 象限分析 */}
      <section className="space-y-4">
        <SectionHeading
          step="STEP 3"
          icon={Grid2x2}
          title="象限分析 · 最核心的一步"
          desc="以 Cost 为横轴、ROI 为纵轴，把所有视频切成四象限，每一类对应一个明确动作。复盘的第一要务，是把「高消耗低 ROI」的浪费素材揪出来关停。"
        />
        <Card>
          <div className="flex items-center justify-center gap-2 pb-3 text-2xs font-medium text-zinc-400">
            <TrendingUp className="h-3.5 w-3.5" /> ROI 高
          </div>
          <div className="grid grid-cols-2 gap-3">
            {QUADRANTS.map((q) => (
              <div
                key={q.en}
                className={cn("rounded-xl border p-4", QUADRANT_BG[q.tone])}
              >
                <div className="flex items-center gap-2">
                  <Badge tone={q.tone}>{q.name}</Badge>
                  <span className="text-2xs text-zinc-400">{q.en}</span>
                </div>
                <div className="mt-2 text-xs font-medium text-zinc-700">{q.cond}</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{q.strategy}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 pt-3 text-2xs font-medium text-zinc-400">
            <TrendingDown className="h-3.5 w-3.5" /> ROI 低 ｜ 横向：左低消耗 → 右高消耗
          </div>
        </Card>
      </section>

      {/* 4 · 漏斗诊断 */}
      <section className="space-y-4">
        <SectionHeading
          step="STEP 4"
          icon={Filter}
          title="漏斗诊断 · 定位断点"
          desc="把投放看成一条漏斗，逐层比对相邻指标的关联，就能定位钱漏在哪一环。"
        />
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {FUNNEL.map((f, i) => (
              <div key={f.label} className="flex items-center gap-2">
                <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/60 px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-zinc-800">
                    <f.icon className="h-3.5 w-3.5 text-indigo-500" /> {f.label}
                  </div>
                  <div className="mt-0.5 text-2xs text-zinc-400">{f.metric}</div>
                </div>
                {i < FUNNEL.length - 1 && <span className="text-zinc-300">→</span>}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
              <div className="text-xs font-medium text-amber-800">高 CTR + 低 CVR</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                视频吸引人但产品不匹配，或是「标题党」——优化创意与产品相关性。
              </p>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3">
              <div className="text-xs font-medium text-sky-800">低 CTR + 高 CVR</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                人群精准但素材前 3 秒不够吸引——重做钩子，把人留下来。
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* 5 · 三大典型问题 */}
      <section className="space-y-4">
        <SectionHeading
          step="STEP 5"
          icon={AlertTriangle}
          title="三大典型问题 · 对症下药"
          desc="GMVMax 复盘里最常撞上的三种异常，每一种都给出判断信号、归因与可执行对策。"
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {PROBLEMS.map((p) => (
            <Card key={p.title} className="flex flex-col">
              <div className="flex items-center gap-2">
                <Badge tone={p.tone}>{p.title}</Badge>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-zinc-500">{p.signal}</p>
              <div className="mt-3 space-y-2.5">
                {p.cases.map((c) => (
                  <div key={c.when} className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3">
                    <div className="text-xs font-medium text-zinc-800">{c.when}</div>
                    <p className="mt-1 text-2xs leading-relaxed text-zinc-500">{c.verdict}</p>
                    <p className="mt-1.5 flex items-start gap-1 text-2xs leading-relaxed text-indigo-600">
                      <span className="shrink-0">→</span>
                      <span>{c.action}</span>
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 6 · Gemini Prompt 模板 */}
      <section className="space-y-4">
        <SectionHeading
          step="STEP 6"
          icon={Sparkles}
          title="Gemini Prompt 模板 · 一键复制"
          desc="保存这套模板，每次只需上传新报表 + 粘贴提示词。多模态版可同时上传高/低 ROI 视频文件，让 Gemini 从画面层面找原因。"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone="brand">核心分析</Badge>
                <span className="text-xs text-zinc-500">象限 + 漏斗 + 创意 + 行动清单</span>
              </div>
              <CopyButton text={ANALYSIS_PROMPT} />
            </div>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3 text-2xs leading-relaxed text-zinc-600">
              {ANALYSIS_PROMPT}
            </pre>
          </Card>
          <Card className="flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone="violet">多模态进阶</Badge>
                <span className="text-xs text-zinc-500">上传视频做视觉归因</span>
              </div>
              <CopyButton text={VISION_PROMPT} />
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3 text-2xs leading-relaxed text-zinc-600">
              {VISION_PROMPT}
            </pre>
            <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-2xs leading-relaxed text-zinc-600">
              先跑核心分析拿到「浪费素材 / 潜力素材」名单，再把对应的高、低 ROI 视频丢进多模态版，逐帧拆解前 3 秒的差异，直接指导下一轮拍摄脚本。
            </div>
          </Card>
        </div>
      </section>

      {/* 7 · 行动清单 */}
      <section className="space-y-4">
        <SectionHeading
          step="STEP 7"
          icon={ClipboardList}
          title="输出 · 优化行动清单"
          desc="复盘不是出一堆分析，而是落到一张可执行的 To-Do：谁关停、谁加推、谁重剪，按优先级排好。下方为示例输出。"
        />
        <TableWrap minWidth={720}>
          <THead>
            <Tr>
              <Th>Video / Title</Th>
              <Th>当前问题</Th>
              <Th>建议操作</Th>
              <Th align="center">优先级</Th>
            </Tr>
          </THead>
          <tbody>
            {ACTION_SAMPLE.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium text-zinc-800">{r.id}</Td>
                <Td className="text-zinc-600">{r.problem}</Td>
                <Td className="text-zinc-600">{r.action}</Td>
                <Td align="center">
                  <Badge tone={r.priority === "P0" ? "danger" : "warning"}>{r.priority}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="text-2xs text-zinc-400">
          P0 紧急（立即关停 / 修改）· P1 重要（本轮迭代排期）。示例数据，接入报表后由 Gemini 自动生成。
        </p>
      </section>
    </div>
  );
}
