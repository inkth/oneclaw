package review

import (
	"bytes"
	"encoding/csv"
	"io"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// MaxRows 单次分析的数据行上限。
const MaxRows = 5000

// ParseResult 解析结果:归一化行 + 警告(缺列等)。
type ParseResult struct {
	Rows     []MetricRow
	Warnings []string
}

// field 内部字段标识(对应 MetricRow 各列)。
type field string

const (
	fROI         field = "roi"
	fCTR         field = "ctr"
	fCVR         field = "cvr"
	fView2s      field = "view2s"
	fView6s      field = "view6s"
	fView100     field = "view100"
	fGMV         field = "gmv"
	fCost        field = "cost"
	fImpressions field = "impressions"
	fClicks      field = "clicks"
	fOrders      field = "orders"
	fCreator     field = "creator"
	fTitle       field = "title"
	fVideoID     field = "videoId"
)

// fieldAlias 表头别名(中英混排)。归一化后用「包含」匹配,顺序靠前者优先,
// 避免「点击率」被「点击」抢走。每个字段只认领第一列。
type fieldAlias struct {
	field   field
	aliases []string
}

var fieldAliases = []fieldAlias{
	{fROI, []string{"roi", "roas", "投产比", "投入产出比", "投资回报率"}},
	{fCTR, []string{"ctr", "clickrate", "点击率"}},
	{fCVR, []string{"cvr", "conversionrate", "转化率"}},
	{fView2s, []string{"2s", "2second", "2秒"}},
	{fView6s, []string{"6s", "6second", "6秒"}},
	{fView100, []string{"100", "完播率", "完播", "videoviewrate"}},
	{fGMV, []string{"gmv", "grossrevenue", "成交金额", "总销售额", "销售额", "revenue"}},
	{fCost, []string{"cost", "消耗", "广告花费", "花费", "spend", "adspend"}},
	{fImpressions, []string{"impression", "曝光", "展示次数", "展示量"}},
	{fClicks, []string{"click", "点击数", "点击量", "点击次数"}},
	{fOrders, []string{"order", "订单", "成交单", "下单"}},
	{fCreator, []string{"account", "creator", "达人", "账号", "作者", "creatorname"}},
	{fTitle, []string{"videotitle", "title", "标题", "视频名称", "creativename"}},
	{fVideoID, []string{"videoid", "creativeid", "视频id", "creative", "videocode", "id"}},
}

// headerStripSet 归一化表头时要剔除的标点/分隔符(空白另行处理)。
var headerStripSet = map[rune]bool{}

func init() {
	for _, r := range "()（）|｜/、_-．.%％·・:：,，" {
		headerStripSet[r] = true
	}
}

// normHeader 归一化表头:小写、去空白与常见分隔/标点,保留字母数字与中文。
func normHeader(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == ' ' {
			continue
		}
		if headerStripSet[r] {
			continue
		}
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

// mapHeaders 把表头行映射成 列索引 → 字段。
func mapHeaders(headers []string) (colToField map[int]field, found map[field]bool) {
	colToField = map[int]field{}
	found = map[field]bool{}
	normed := make([]string, len(headers))
	for i, h := range headers {
		normed[i] = normHeader(h)
	}
	for _, fa := range fieldAliases {
		if found[fa.field] {
			continue
		}
		for col := 0; col < len(normed); col++ {
			if _, taken := colToField[col]; taken {
				continue // 该列已被更高优先级字段认领
			}
			h := normed[col]
			if h == "" {
				continue
			}
			for _, a := range fa.aliases {
				if strings.Contains(h, a) {
					colToField[col] = fa.field
					found[fa.field] = true
					break
				}
			}
			if found[fa.field] {
				break
			}
		}
	}
	return colToField, found
}

// parseNum 解析数值:去货币符号/千分位,识别百分比。
// isRate=true 时把 % 或 >1 的值折成 0..1。
func parseNum(raw string, isRate bool) float64 {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0
	}
	isPct := strings.Contains(s, "%") || strings.Contains(s, "％")
	var b strings.Builder
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == '.' || r == '-' {
			b.WriteRune(r)
		}
	}
	cleaned := b.String()
	if cleaned == "" || cleaned == "-" || cleaned == "." {
		return 0
	}
	n, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return 0
	}
	if isRate {
		if isPct {
			n = n / 100
		} else if n > 1 {
			n = n / 100 // 形如 "1.2" 视为 1.2%
		}
	}
	return n
}

// cell 安全取行内某列(越界返回空串)。
func cell(row []string, col int) string {
	if col < 0 || col >= len(row) {
		return ""
	}
	return row[col]
}

// rowsToMetrics 把一批「表头 + 数据行」(二维数组)归一化为 []MetricRow。
func rowsToMetrics(table [][]string) ParseResult {
	warnings := []string{}

	headerIdx := -1
	var colToField map[int]field
	var found map[field]bool
	limit := len(table)
	if limit > 15 {
		limit = 15
	}
	for i := 0; i < limit; i++ {
		cells := table[i]
		allBlank := true
		for _, c := range cells {
			if strings.TrimSpace(c) != "" {
				allBlank = false
				break
			}
		}
		if allBlank {
			continue
		}
		ctf, fnd := mapHeaders(cells)
		// 至少要能认出「消耗 / 曝光 / GMV」之一,才像是表头行
		if fnd[fCost] || fnd[fImpressions] || fnd[fGMV] {
			headerIdx = i
			colToField = ctf
			found = fnd
			break
		}
	}

	if headerIdx < 0 {
		return ParseResult{
			Rows:     []MetricRow{},
			Warnings: []string{"未能识别表头:请确认报表包含 Cost/消耗、GMV、曝光、点击、订单等列"},
		}
	}

	for _, need := range []field{fCost, fGMV} {
		if !found[need] {
			label := "GMV 成交金额"
			if need == fCost {
				label = "Cost 消耗"
			}
			warnings = append(warnings, "未找到「"+label+"」列,相关指标将按 0 计")
		}
	}

	// 字段 → 列索引(取第一个匹配列)。
	fieldCol := func(f field) int {
		for col, ff := range colToField {
			if ff == f {
				return col
			}
		}
		return -1
	}
	get := func(row []string, f field) string {
		col := fieldCol(f)
		if col < 0 {
			return ""
		}
		return cell(row, col)
	}

	rows := []MetricRow{}
	for i := headerIdx + 1; i < len(table); i++ {
		if len(rows) >= MaxRows {
			warnings = append(warnings, "数据超过 "+strconv.Itoa(MaxRows)+" 行,已截断分析前 "+strconv.Itoa(MaxRows)+" 行")
			break
		}
		r := table[i]
		blank := true
		for _, c := range r {
			if strings.TrimSpace(c) != "" {
				blank = false
				break
			}
		}
		if blank {
			continue
		}

		cost := parseNum(get(r, fCost), false)
		gmv := parseNum(get(r, fGMV), false)
		impressions := parseNum(get(r, fImpressions), false)
		clicks := parseNum(get(r, fClicks), false)
		orders := parseNum(get(r, fOrders), false)

		// 无任何投放痕迹的行跳过
		if cost == 0 && impressions == 0 && gmv == 0 {
			continue
		}

		ctr := parseNum(get(r, fCTR), true)
		cvr := parseNum(get(r, fCVR), true)
		roi := parseNum(get(r, fROI), false)
		if ctr == 0 && impressions > 0 {
			ctr = clicks / impressions
		}
		if cvr == 0 && clicks > 0 {
			cvr = orders / clicks
		}
		if roi == 0 && cost > 0 {
			roi = gmv / cost
		}

		videoID := strings.TrimSpace(get(r, fVideoID))
		if videoID == "" {
			videoID = "row-" + strconv.Itoa(i+1)
		}
		title := strings.TrimSpace(get(r, fTitle))
		if title == "" {
			title = videoID
		}
		creator := strings.TrimSpace(get(r, fCreator))

		mr := MetricRow{
			VideoID:     videoID,
			Title:       title,
			Creator:     creator,
			Cost:        cost,
			GMV:         gmv,
			ROI:         roi,
			Impressions: impressions,
			Clicks:      clicks,
			Orders:      orders,
			CTR:         ctr,
			CVR:         cvr,
		}
		if found[fView2s] {
			v := parseNum(get(r, fView2s), true)
			mr.View2s = &v
		}
		if found[fView6s] {
			v := parseNum(get(r, fView6s), true)
			mr.View6s = &v
		}
		if found[fView100] {
			v := parseNum(get(r, fView100), true)
			mr.View100 = &v
		}
		rows = append(rows, mr)
	}

	if len(rows) == 0 {
		warnings = append(warnings, "未解析到有效数据行")
	}
	return ParseResult{Rows: rows, Warnings: warnings}
}

// detectDelimiter 从样本首个非空行猜分隔符(逗号 / 制表 / 分号)。
func detectDelimiter(sample string) rune {
	var line string
	for _, l := range strings.Split(sample, "\n") {
		if strings.TrimSpace(l) != "" {
			line = l
			break
		}
	}
	counts := map[rune]int{',': 0, '\t': 0, ';': 0}
	for _, r := range line {
		if _, ok := counts[r]; ok {
			counts[r]++
		}
	}
	best := ','
	bestN := -1
	for _, d := range []rune{',', '\t', ';'} {
		if counts[d] > bestN {
			bestN = counts[d]
			best = d
		}
	}
	return best
}

// parseXlsx 用 excelize 读取第一个工作表为二维字符串数组。
func parseXlsx(data []byte) ([][]string, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return [][]string{}, nil
	}
	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// parseDelimited 用 encoding/csv 按给定分隔符解析(容忍变长行与不规范引号)。
func parseDelimited(text string, delimiter rune) ([][]string, error) {
	r := csv.NewReader(strings.NewReader(text))
	r.Comma = delimiter
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	rows := [][]string{}
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			// 跳过坏行,尽量解析剩余内容
			continue
		}
		rows = append(rows, rec)
	}
	return rows, nil
}

// ParseReport 入口:按文件名/类型选择解析方式,返回归一化行。
func ParseReport(data []byte, filename string) (ParseResult, error) {
	lower := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lower, ".xlsx"):
		table, err := parseXlsx(data)
		if err != nil {
			return ParseResult{}, err
		}
		return rowsToMetrics(table), nil
	case strings.HasSuffix(lower, ".xls"):
		return ParseResult{
			Rows:     []MetricRow{},
			Warnings: []string{"暂不支持旧版 .xls,请在表格软件里另存为 .xlsx 或 CSV"},
		}, nil
	default:
		text := string(data)
		text = strings.TrimPrefix(text, "\uFEFF") // 去 BOM
		var delimiter rune
		if strings.HasSuffix(lower, ".tsv") {
			delimiter = '\t'
		} else {
			sample := text
			if len(sample) > 4000 {
				sample = sample[:4000]
			}
			delimiter = detectDelimiter(sample)
		}
		table, err := parseDelimited(text, delimiter)
		if err != nil {
			return ParseResult{}, err
		}
		return rowsToMetrics(table), nil
	}
}
