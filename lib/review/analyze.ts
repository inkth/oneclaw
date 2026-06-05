import type {
  ActionItem,
  Baseline,
  MetricRow,
  Quadrant,
  QuadrantItem,
  ReviewResult,
} from "./types";

const DEFAULT_TARGET_ROI = 3.0;
const SAMPLE_PER_QUADRANT = 6; // 每象限返回的代表样本数

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function computeBaseline(rows: MetricRow[], targetRoi: number): Baseline {
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const totalGmv = rows.reduce((a, r) => a + r.gmv, 0);
  const totalImpr = rows.reduce((a, r) => a + r.impressions, 0);
  const totalClicks = rows.reduce((a, r) => a + r.clicks, 0);
  const totalOrders = rows.reduce((a, r) => a + r.orders, 0);
  const view2sVals = rows.map((r) => r.view2s).filter((v): v is number => v != null && v > 0);

  return {
    rowCount: rows.length,
    totalCost,
    totalGmv,
    roi: totalCost > 0 ? totalGmv / totalCost : 0,
    avgCtr: totalImpr > 0 ? totalClicks / totalImpr : 0,
    avgCvr: totalClicks > 0 ? totalOrders / totalClicks : 0,
    avgView2s: view2sVals.length
      ? view2sVals.reduce((a, b) => a + b, 0) / view2sVals.length
      : null,
    targetRoi,
    // 高/低消耗以「有消耗视频」的消耗中位数为界
    costThreshold: median(rows.filter((r) => r.cost > 0).map((r) => r.cost)),
  };
}

function classify(r: MetricRow, b: Baseline): Quadrant {
  const highCost = r.cost >= b.costThreshold && r.cost > 0;
  const highRoi = r.roi >= b.targetRoi;
  if (highCost && highRoi) return "winner";
  if (!highCost && highRoi) return "potential";
  if (highCost && !highRoi) return "bleeder";
  return "longtail";
}

/** 漏斗诊断：对一条素材给出「问题 + 操作 + 优先级」。 */
function diagnose(r: MetricRow, b: Baseline, q: Quadrant): Omit<ActionItem, "videoId" | "title" | "quadrant"> {
  const ctrLow = r.ctr < b.avgCtr;
  const cvrLow = r.cvr < b.avgCvr;

  if (q === "bleeder") {
    // 高消耗低 ROI —— 第一优先级
    if (r.orders === 0) {
      // 有消耗无转化
      const view2sLow = r.view2s != null && b.avgView2s != null && r.view2s < b.avgView2s;
      if (r.ctr >= b.avgCtr && view2sLow) {
        return {
          problem: "有消耗无转化 · 高点击低完播（疑似标题党）",
          action: "立即关停；重做创意让内容与产品强相关",
          priority: "P0",
        };
      }
      return {
        problem: "有消耗无转化 · 流量正常但转化断裂",
        action: "立即关停；排查落地页加载速度与首图",
        priority: "P0",
      };
    }
    // 有转化但 ROI 低（CPA 过高）
    if (ctrLow && !cvrLow) {
      return {
        problem: "高耗低效 · 素材吸引力不足（CTR 低）",
        action: "关停或降权；打磨前 3 秒钩子提升 CTR",
        priority: "P0",
      };
    }
    if (!ctrLow && cvrLow) {
      return {
        problem: "高耗低效 · 转化环节弱（CVR 低）",
        action: "关停或降权；优化落地页/价格/促销/评价",
        priority: "P0",
      };
    }
    if (ctrLow && cvrLow) {
      return {
        problem: "高耗低效 · 全链路问题（CTR、CVR 双低）",
        action: "立即关停；先换素材再优化落地页",
        priority: "P0",
      };
    }
    return {
      problem: "高耗低效 · ROI 未达标",
      action: "降权观察；预算转给潜力/明星素材",
      priority: "P0",
    };
  }

  if (q === "potential") {
    return {
      problem: "低耗高 ROI · 被系统忽视的遗珠",
      action: "复制计划单独放量测试，给足探索预算",
      priority: "P1",
    };
  }

  if (q === "longtail") {
    // 消耗慢、量起不来 —— 素材竞争力弱
    if (r.ctr > 0 && r.ctr < b.avgCtr * 0.5) {
      return {
        problem: "起量慢 · CTR 显著低于基准（素材竞争力弱）",
        action: "重剪前 2 秒钩子，套用 Trending Audio；或小幅放宽 ROI 目标",
        priority: "P1",
      };
    }
    return {
      problem: "长尾 · 样本太小无统计意义",
      action: "暂时忽略，必要时并入新一轮测试",
      priority: "P2",
    };
  }

  // winner
  return {
    problem: "明星素材 · 高耗高 ROI",
    action: "交给系统自动跑或手动加推扩量，盯紧 ROI 衰减",
    priority: "P2",
  };
}

function toItem(r: MetricRow, q: Quadrant): QuadrantItem {
  return {
    videoId: r.videoId,
    title: r.title,
    creator: r.creator,
    cost: r.cost,
    gmv: r.gmv,
    roi: r.roi,
    ctr: r.ctr,
    cvr: r.cvr,
    orders: r.orders,
    quadrant: q,
  };
}

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2 } as const;

/** 生成可直接粘进 Gemini 的提示词，注入真实基线与重点素材清单。 */
function buildGeminiPrompt(b: Baseline, bleeders: QuadrantItem[], potentials: QuadrantItem[]): string {
  const pct = (n: number) => (n * 100).toFixed(2) + "%";
  const list = (items: QuadrantItem[]) =>
    items.length
      ? items.slice(0, 10).map((i) => {
          const who = i.creator ? ` @${i.creator.replace(/^@+/, "")}` : "";
          return `  · ${i.videoId}${who}（ROI ${i.roi.toFixed(2)}, CTR ${pct(i.ctr)}, CVR ${pct(i.cvr)}）`;
        }).join("\n")
      : "  （无）";

  return `角色设定：你是一位资深的 TikTok 投放专家和数据分析师。
任务：我已对 GMVMax 报表做了初步复盘，请基于以下基线与重点素材清单，做创意深度挖掘并产出可执行的优化清单，必要时用 Python 复核计算，不要凭空猜测。

【大盘基线】
· 视频数：${b.rowCount}
· 大盘 ROI：${b.roi.toFixed(2)}（目标 ${b.targetRoi.toFixed(1)}）
· 平均 CTR：${pct(b.avgCtr)} ｜ 平均 CVR：${pct(b.avgCvr)}${b.avgView2s != null ? ` ｜ 平均 2s 完播：${pct(b.avgView2s)}` : ""}
· 总消耗：${b.totalCost.toFixed(0)} ｜ 总 GMV：${b.totalGmv.toFixed(0)}

【浪费素材（高消耗·低 ROI，需重点处理）】
${list(bleeders)}

【潜力素材（低消耗·高 ROI，建议放量）】
${list(potentials)}

请完成：
1. 创意深度挖掘：对比高/低 ROI 视频的标题关键词与前 6 秒留存，找出共性钩子。
2. 漏斗归因：对每条浪费素材判断是「高 CTR 低 CVR（标题党/产品不匹配）」还是「低 CTR 高 CVR（前 3 秒不够吸引）」。
3. 达人分析：哪个达人平均 ROI 最高？哪个靠低价换量？
4. 输出一份 Markdown 表格「优化行动清单」：Video ID / Title ｜ 当前问题 ｜ 建议操作 ｜ 优先级（P0/P1）。

（多模态进阶）我可再上传高、低 ROI 各一条视频文件，请从视觉层面分析：高 ROI 做对了什么？低 ROI 前 3 秒为何流失？`;
}

/** 复盘引擎主入口：归一化行 → 完整复盘结果。 */
export function analyzeReview(
  rows: MetricRow[],
  opts?: { targetRoi?: number; warnings?: string[] },
): ReviewResult {
  const targetRoi = opts?.targetRoi && opts.targetRoi > 0 ? opts.targetRoi : DEFAULT_TARGET_ROI;
  const baseline = computeBaseline(rows, targetRoi);

  const counts: Record<Quadrant, number> = { winner: 0, potential: 0, bleeder: 0, longtail: 0 };
  const buckets: Record<Quadrant, QuadrantItem[]> = {
    winner: [],
    potential: [],
    bleeder: [],
    longtail: [],
  };
  const actions: ActionItem[] = [];

  for (const r of rows) {
    const q = classify(r, baseline);
    counts[q]++;
    const item = toItem(r, q);
    buckets[q].push(item);
    const d = diagnose(r, baseline, q);
    actions.push({ videoId: r.videoId, title: r.title, quadrant: q, ...d });
  }

  // 每象限按消耗降序取代表样本
  for (const q of Object.keys(buckets) as Quadrant[]) {
    buckets[q].sort((a, b) => b.cost - a.cost);
  }

  // 行动清单：优先级 → 消耗降序；只保留需要动手的（P0/P1），P2 收尾少量
  const costOf = new Map(rows.map((r) => [r.videoId, r.cost]));
  actions.sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return (costOf.get(b.videoId) ?? 0) - (costOf.get(a.videoId) ?? 0);
  });
  const actionable = actions.filter((a) => a.priority !== "P2");
  const topActions = (actionable.length ? actionable : actions).slice(0, 30);

  return {
    baseline,
    counts,
    quadrants: {
      winner: buckets.winner.slice(0, SAMPLE_PER_QUADRANT),
      potential: buckets.potential.slice(0, SAMPLE_PER_QUADRANT),
      bleeder: buckets.bleeder.slice(0, SAMPLE_PER_QUADRANT),
      longtail: buckets.longtail.slice(0, SAMPLE_PER_QUADRANT),
    },
    actions: topActions,
    geminiPrompt: buildGeminiPrompt(baseline, buckets.bleeder, buckets.potential),
    warnings: opts?.warnings ?? [],
  };
}
