import ExcelJS from "exceljs";
import type { MetricRow } from "./types";

export const MAX_ROWS = 5000;

/** 解析结果：归一化行 + 警告（缺列等）。 */
export interface ParseResult {
  rows: MetricRow[];
  warnings: string[];
}

// ── 表头别名（中英混排）。归一化后用「包含」匹配，顺序靠前者优先，避免
//    「点击率」被「点击」抢走。每个字段只认领第一列。 ──────────────────
type Field = keyof MetricRow;

const FIELD_ALIASES: { field: Field; aliases: string[] }[] = [
  { field: "roi", aliases: ["roi", "roas", "投产比", "投入产出比", "投资回报率"] },
  { field: "ctr", aliases: ["ctr", "clickrate", "点击率"] },
  { field: "cvr", aliases: ["cvr", "conversionrate", "转化率"] },
  { field: "view2s", aliases: ["2s", "2second", "2秒"] },
  { field: "view6s", aliases: ["6s", "6second", "6秒"] },
  { field: "view100", aliases: ["100", "完播率", "完播", "videoviewrate"] },
  { field: "gmv", aliases: ["gmv", "grossrevenue", "成交金额", "总销售额", "销售额", "revenue"] },
  { field: "cost", aliases: ["cost", "消耗", "广告花费", "花费", "spend", "adspend"] },
  {
    field: "impressions",
    aliases: ["impression", "曝光", "展示次数", "展示量"],
  },
  { field: "clicks", aliases: ["click", "点击数", "点击量", "点击次数"] },
  { field: "orders", aliases: ["order", "订单", "成交单", "下单"] },
  {
    field: "creator",
    aliases: ["account", "creator", "达人", "账号", "作者", "creatorname"],
  },
  { field: "title", aliases: ["videotitle", "title", "标题", "视频名称", "creativename"] },
  { field: "videoId", aliases: ["videoid", "creativeid", "视频id", "creative", "videocode", "id"] },
];

/** 归一化表头：小写、去空白与常见分隔/标点，保留字母数字与中文。 */
function normHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s()（）|｜/、_\-．.%％·・:：,，]/g, "")
    .trim();
}

/** 把表头行映射成 列索引 → 字段。 */
function mapHeaders(headers: string[]): {
  colToField: Map<number, Field>;
  found: Set<Field>;
} {
  const colToField = new Map<number, Field>();
  const found = new Set<Field>();
  const normed = headers.map(normHeader);

  for (const { field, aliases } of FIELD_ALIASES) {
    if (found.has(field)) continue;
    for (let col = 0; col < normed.length; col++) {
      if (colToField.has(col)) continue; // 该列已被更高优先级字段认领
      const h = normed[col];
      if (!h) continue;
      if (aliases.some((a) => h.includes(a))) {
        colToField.set(col, field);
        found.add(field);
        break;
      }
    }
  }
  return { colToField, found };
}

/** 解析数值：去货币符号/千分位，识别百分比。isRate=true 时把 % 或 >1 的值折成 0..1。 */
function parseNum(raw: unknown, isRate = false): number {
  if (raw == null) return 0;
  if (typeof raw === "number") {
    return isRate && raw > 1 ? raw / 100 : raw;
  }
  let s = String(raw).trim();
  if (!s) return 0;
  const isPct = s.includes("%") || s.includes("％");
  s = s.replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === ".") return 0;
  let n = parseFloat(s);
  if (!isFinite(n)) return 0;
  if (isRate) {
    if (isPct) n = n / 100;
    else if (n > 1) n = n / 100; // 形如 "1.2" 视为 1.2%
  }
  return n;
}

/** 把一批「表头 + 数据行」（二维数组）归一化为 MetricRow[]。 */
function rowsToMetrics(table: unknown[][]): ParseResult {
  const warnings: string[] = [];
  // 找到第一行非空、且能映射到关键字段的行作为表头
  let headerIdx = -1;
  let mapping: ReturnType<typeof mapHeaders> | null = null;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const cells = table[i]?.map((c) => (c == null ? "" : String(c))) ?? [];
    if (cells.every((c) => !c.trim())) continue;
    const m = mapHeaders(cells);
    // 至少要能认出「消耗或曝光」之一，才像是表头行
    if (m.found.has("cost") || m.found.has("impressions") || m.found.has("gmv")) {
      headerIdx = i;
      mapping = m;
      break;
    }
  }

  if (headerIdx < 0 || !mapping) {
    return {
      rows: [],
      warnings: ["未能识别表头：请确认报表包含 Cost/消耗、GMV、曝光、点击、订单等列"],
    };
  }

  const { colToField, found } = mapping;
  for (const need of ["cost", "gmv"] as Field[]) {
    if (!found.has(need)) {
      warnings.push(`未找到「${need === "cost" ? "Cost 消耗" : "GMV 成交金额"}」列，相关指标将按 0 计`);
    }
  }

  const get = (row: unknown[], field: Field): unknown => {
    for (const [col, f] of colToField) if (f === field && col < row.length) return row[col];
    return undefined;
  };

  const rows: MetricRow[] = [];
  for (let i = headerIdx + 1; i < table.length; i++) {
    if (rows.length >= MAX_ROWS) {
      warnings.push(`数据超过 ${MAX_ROWS} 行，已截断分析前 ${MAX_ROWS} 行`);
      break;
    }
    const r = table[i];
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;

    const cost = parseNum(get(r, "cost"));
    const gmv = parseNum(get(r, "gmv"));
    const impressions = parseNum(get(r, "impressions"));
    const clicks = parseNum(get(r, "clicks"));
    const orders = parseNum(get(r, "orders"));

    // 无任何投放痕迹的行跳过
    if (cost === 0 && impressions === 0 && gmv === 0) continue;

    let ctr = parseNum(get(r, "ctr"), true);
    let cvr = parseNum(get(r, "cvr"), true);
    let roi = parseNum(get(r, "roi"));
    if (ctr === 0 && impressions > 0) ctr = clicks / impressions;
    if (cvr === 0 && clicks > 0) cvr = orders / clicks;
    if (roi === 0 && cost > 0) roi = gmv / cost;

    const videoId = String(get(r, "videoId") ?? "").trim() || `row-${i + 1}`;
    const title = String(get(r, "title") ?? "").trim() || videoId;
    const creator = String(get(r, "creator") ?? "").trim() || undefined;
    const view2s = found.has("view2s") ? parseNum(get(r, "view2s"), true) : undefined;
    const view6s = found.has("view6s") ? parseNum(get(r, "view6s"), true) : undefined;
    const view100 = found.has("view100") ? parseNum(get(r, "view100"), true) : undefined;

    rows.push({
      videoId,
      title,
      creator,
      cost,
      gmv,
      roi,
      impressions,
      clicks,
      orders,
      ctr,
      cvr,
      view2s,
      view6s,
      view100,
    });
  }

  if (!rows.length) warnings.push("未解析到有效数据行");
  return { rows, warnings };
}

// ── CSV / TSV：识别分隔符 + 处理引号转义 ─────────────────────────────
function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts: Record<string, number> = {
    ",": (line.match(/,/g) || []).length,
    "\t": (line.match(/\t/g) || []).length,
    ";": (line.match(/;/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // 忽略，等待 \n
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function parseXlsx(buf: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const table: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]; // exceljs 数组下标从 1 开始
    const cells: unknown[] = [];
    for (let c = 1; c < values.length; c++) {
      const v = values[c];
      // 处理富文本 / 公式结果对象
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        cells.push(o.result ?? o.text ?? o.hyperlink ?? "");
      } else cells.push(v ?? "");
    }
    table.push(cells);
  });
  return table;
}

/** 入口：根据文件名/类型选择解析方式，返回归一化行。 */
export async function parseReport(
  buf: Buffer,
  filename: string,
): Promise<ParseResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const table = await parseXlsx(buf);
    return rowsToMetrics(table);
  }
  if (lower.endsWith(".xls")) {
    return {
      rows: [],
      warnings: ["暂不支持旧版 .xls，请在表格软件里另存为 .xlsx 或 CSV"],
    };
  }
  // 默认按文本：CSV / TSV
  let text = buf.toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 去 BOM
  const delimiter = lower.endsWith(".tsv") ? "\t" : detectDelimiter(text.slice(0, 4000));
  return rowsToMetrics(parseDelimited(text, delimiter));
}
