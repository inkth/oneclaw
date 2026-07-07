package service

import "strings"

// ── 目标市场 → 口播语言映射(生成侧唯一事实来源) ─────────────────────────────
//
// Seedance 配音由 videoPrompt 引号内台词驱动:台词写什么语言,配音就是什么语言,
// 所以这张表直接决定成片口播。前端 app/(app)/app/discover/_components/regions.ts
// 的 lang 字段只做下拉预览文案,确认后的展示一律用后端写进任务 metadata 的 voiceLang。

// voiceSpec 一个目标市场的口播配置。
type voiceSpec struct {
	MarketCN  string // 市场中文名,注入 system prompt
	LangCN    string // 口播语言中文名,写进 metadata.voiceLang 供前端展示
	Directive string // 英文语言指令,注入 videoPrompt 末尾锚定配音语言/口音
}

var regionVoices = map[string]voiceSpec{
	"US": {"美国", "英语", "English (casual American accent)"},
	"GB": {"英国", "英语", "English (British accent)"},
	"SG": {"新加坡", "英语", "English"},
	"ID": {"印尼", "印尼语", "Indonesian (Bahasa Indonesia)"},
	"TH": {"泰国", "泰语", "Thai"},
	"VN": {"越南", "越南语", "Vietnamese"},
	"MY": {"马来", "马来语", "Malay (Bahasa Melayu)"},
	"PH": {"菲律宾", "菲律宾语", "Filipino (Tagalog), naturally mixing common English words as in everyday Taglish"},
	"ES": {"西班牙", "西班牙语", "Spanish (European)"},
	"MX": {"墨西哥", "西班牙语", "Spanish (Latin American)"},
	"DE": {"德国", "德语", "German"},
	"FR": {"法国", "法语", "French"},
	"IT": {"意大利", "意大利语", "Italian"},
	"BR": {"巴西", "葡萄牙语", "Brazilian Portuguese"},
	"JP": {"日本", "日语", "Japanese"},
}

// voiceFor 返回归一后的 region 及其口播配置;空/非法值静默回退 US(英语)。
func voiceFor(region string) (string, voiceSpec) {
	r := strings.ToUpper(strings.TrimSpace(region))
	if v, ok := regionVoices[r]; ok {
		return r, v
	}
	return "US", regionVoices["US"]
}
