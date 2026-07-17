package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/llm"
)

// ── 视频解析:上传带货视频 → 抽音轨 + 关键帧 → 多模态模型转录/翻译/拆解 ──────────────

const (
	vaMaxVideoBytes = 200 << 20        // 下载视频上限 200MB,超出视为异常
	vaMaxSeconds    = "300"            // 只解析前 5 分钟,带货短视频足够,且防长视频拖死
	vaMaxFrames     = 4                // 取几帧画面给模型补视觉上下文(钩子画面/产品镜头)
	vaAudioFormat   = "mp3"            // 抽出的音轨编码,须与 input_audio.format 一致
	vaFFmpegTimeout = 90 * time.Second // 单次 ffmpeg 超时
	vaDownloadLimit = 60 * time.Second // 下载视频超时
)

// videoAnalysisOut 是多模态模型返回的结构化解析结果。
type videoAnalysisOut struct {
	Lang    string `json:"lang"`    // 原始口播语言(中文名,如 英语/印尼语)
	Title   string `json:"title"`   // 给这条视频起的中文小标题
	Summary string `json:"summary"` // 一句话:卖什么、靠什么打动人
	Lines   []struct {
		T        string `json:"t"`        // 大致时间码,如 0:00-0:03
		Original string `json:"original"` // 原文口播
		Zh       string `json:"zh"`       // 中文翻译
	} `json:"lines"`
	Structure struct {
		Hook    string `json:"hook"`    // 钩子:开头怎么抓注意力
		Pain    string `json:"pain"`    // 痛点:戳了什么需求/焦虑
		Selling string `json:"selling"` // 卖点:核心卖点怎么呈现
		Cta     string `json:"cta"`     // CTA:结尾怎么促单
	} `json:"structure"`
	ReusablePoints []string `json:"reusablePoints"` // 可复用套路要点
	Adaptations    []string `json:"adaptations"`    // 改编到自己商品的建议
}

// 视频解析分两段(ReviewModel=minimax 不吃 input_audio,故转录另用 AudioModel=voxtral):
//   ① videoTranscribeSystem  → AudioModel 听音轨,产出 lang + 逐句 lines(原文+中文)
//   ② videoBreakdownSystem   → ReviewModel 拿①的转录文本 + 关键帧,产出 title/summary/structure/... 拆解
// 两段结果合并成同一个 videoAnalysisOut,对上层与前端契约不变。

const videoTranscribeSystem = `你是带货短视频的口播转录员。输入是一段视频的音轨。请完成:
1. 逐句转录口播原文(保留原始语言,不要翻译),按出现顺序切句并标注大致时间码(如 0:00-0:03)。
2. 把每句翻译成自然流畅的中文(地道表达,不要直译腔)。
3. 判断原始口播语言,用中文写语言名(如 英语 / 印尼语 / 泰语 / 越南语)。

严格要求:
- 只输出合法 JSON,结构严格如下,不要任何额外文字、解释或 markdown 围栏。
- 纯音乐 / 无口播时 lines 返回空数组,lang 填 "无口播"。

JSON 结构:
{"lang": "原始口播语言中文名", "lines": [{"t": "0:00-0:03", "original": "原文口播", "zh": "中文翻译"}]}`

const videoBreakdownSystem = `你是 发现猫 的"带货视频解析 Agent",服务 TikTok Shop 跨境卖家。
输入是这条带货短视频的口播转录(已附原文与中文翻译)和若干帧画面。请用中文完成:
1. 给视频起一个中文小标题(title)。
2. 一句话说清:卖什么、靠什么打动人(summary)。
3. 拆解带货结构:钩子(开头怎么抓注意力)、痛点(戳了什么需求/焦虑)、卖点(核心卖点怎么呈现)、CTA(结尾怎么促单)。
4. 提炼这条视频值得复用的套路要点(reusablePoints)。
5. 给出把它改编成中国卖家自己商品的具体建议(adaptations)。

严格要求:
- 只输出合法 JSON,结构严格如下,不要任何额外文字、解释或 markdown 围栏。
- 转录为空(无口播 / 纯音乐)时,summary 注明"无口播,以下基于画面",仍尽量基于画面给出 structure 与 adaptations。
- reusablePoints 与 adaptations 各给 3-5 条,具体可落地,不要空话。

JSON 结构:
{
  "title": "给视频起的中文小标题",
  "summary": "一句话:卖什么、靠什么打动人",
  "structure": {"hook": "...", "pain": "...", "selling": "...", "cta": "..."},
  "reusablePoints": ["..."],
  "adaptations": ["..."]
}`

// runVideoAnalysis 解析一条上传的带货视频:取素材 → 下载 → ffmpeg 抽音轨+关键帧 → 多模态模型转录/翻译/拆解。
// input 是用户可选的关注点(如"重点看钩子");opts.MaterialID 是上传后落库的视频素材。
func (s *AgentService) runVideoAnalysis(ctx context.Context, wsID uuid.UUID, input string, opts AgentCreateOpts) (string, any, llm.Usage, error) {
	if !s.llm.Configured() {
		return "", nil, llm.Usage{}, fmt.Errorf("AI 未配置:请设置 OPENROUTER_API_KEY")
	}
	if opts.MaterialID == nil {
		return "", nil, llm.Usage{}, fmt.Errorf("请先上传要解析的视频")
	}
	videoURL := s.materialVideoURL(ctx, wsID, *opts.MaterialID)
	if videoURL == "" {
		return "", nil, llm.Usage{}, fmt.Errorf("视频素材不存在或不是视频文件")
	}

	// 下载视频字节(COS 公读 URL),供 ffmpeg 本地处理。
	raw, err := downloadVideoBytes(ctx, videoURL)
	if err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("下载视频失败:%w", err)
	}

	// 抽音轨 + 取关键帧:音轨是脚本主来源,关键帧给模型补视觉上下文。
	audio, frames, err := extractAudioAndFrames(ctx, raw)
	if err != nil {
		return "", nil, llm.Usage{}, err
	}
	if audio == nil && len(frames) == 0 {
		return "", nil, llm.Usage{}, fmt.Errorf("无法从视频提取音轨或画面,请确认文件可正常播放")
	}

	focus := ""
	if f := strings.TrimSpace(input); f != "" && f != "解析视频脚本" {
		focus = f
	}

	out, usage, err := analyzeVideoTwoStage(ctx, s.llm, focus, audio, frames)
	if err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("视频解析失败:%w", err)
	}

	title := strings.TrimSpace(out.Title)
	if title == "" {
		title = "带货视频解析"
	}

	meta := map[string]any{
		"kind":           "videoAnalysis",
		"videoUrl":       videoURL,
		"materialId":     opts.MaterialID.String(),
		"lang":           out.Lang,
		"title":          title,
		"summary":        out.Summary,
		"lines":          out.Lines,
		"structure":      out.Structure,
		"reusablePoints": out.ReusablePoints,
		"adaptations":    out.Adaptations,
	}

	// 人类可读摘要(task.output):结构化细节由前端读 metadata 渲染,这里给一段纯文本兜底。
	var b strings.Builder
	fmt.Fprintf(&b, "🎬 %s", title)
	if out.Lang != "" {
		fmt.Fprintf(&b, " · 原声:%s", out.Lang)
	}
	if s := strings.TrimSpace(out.Summary); s != "" {
		fmt.Fprintf(&b, "\n\n%s", s)
	}
	fmt.Fprintf(&b, "\n\n已提取逐句脚本(%d 句)与中文翻译、带货结构拆解和改编建议,展开查看。", len(out.Lines))

	return b.String(), meta, usage, nil
}

// analyzeVideoTwoStage 两段式解析:
//
//	① AudioModel(voxtral)听音轨 → lang + 逐句 lines(原文+中文);
//	② ReviewModel(minimax)拿①的转录文本 + 关键帧 → title/summary/structure/reusablePoints/adaptations。
//
// audio 为 nil(无口播)时跳过①,②仅凭画面。①失败不致命(降级为看帧解析);②失败才返回错误。
// usage 汇总两段的 token 与成本。仅依赖 llm.Client,交互解析与后台管线两处共用。
func analyzeVideoTwoStage(ctx context.Context, l *llm.Client, focus string, audio *llm.AudioPart, frames []string) (*videoAnalysisOut, llm.Usage, error) {
	var out videoAnalysisOut
	var usage llm.Usage
	usage.Model = l.ReviewModel()

	// ── ① 转录段(仅当有音轨)──
	if audio != nil && strings.TrimSpace(audio.Data) != "" {
		tr, err := l.ChatAV(ctx, l.AudioModel(), videoTranscribeSystem,
			"请转录并翻译这段音轨。", audio, nil, true, 3000)
		if err != nil {
			logger.Warn("[video-analysis] 转录段失败,降级为看帧解析",
				logger.String("model", l.AudioModel()), logger.Err(err))
		} else {
			addUsage(&usage, tr.Usage)
			var t struct {
				Lang  string `json:"lang"`
				Lines []struct {
					T        string `json:"t"`
					Original string `json:"original"`
					Zh       string `json:"zh"`
				} `json:"lines"`
			}
			if e := json.Unmarshal([]byte(llm.ExtractJSON(tr.Content)), &t); e != nil {
				logger.Warn("[video-analysis] 转录结果解析失败,降级为看帧解析", logger.Err(e))
			} else {
				out.Lang = t.Lang
				out.Lines = t.Lines // 匿名结构体类型一致,可直接赋值
			}
		}
	}

	// ── ② 拆解段 ──
	var ub strings.Builder
	if len(out.Lines) > 0 {
		if out.Lang != "" {
			fmt.Fprintf(&ub, "口播语言:%s\n", out.Lang)
		}
		ub.WriteString("口播转录(逐句,含中文翻译):\n")
		for _, l := range out.Lines {
			fmt.Fprintf(&ub, "[%s] %s | 中文:%s\n", l.T, l.Original, l.Zh)
		}
	} else {
		ub.WriteString("(该视频无口播或转录为空,请基于画面解析)\n")
	}
	if focus != "" {
		fmt.Fprintf(&ub, "\n用户特别想关注:%s\n", focus)
	}
	ub.WriteString("\n请基于以上转录与画面完成拆解。")

	res, err := l.ChatVision(ctx, l.ReviewModel(), videoBreakdownSystem, ub.String(), frames, true, 4000)
	if err != nil {
		return nil, usage, err
	}
	addUsage(&usage, res.Usage)

	var bd struct {
		Title     string `json:"title"`
		Summary   string `json:"summary"`
		Structure struct {
			Hook    string `json:"hook"`
			Pain    string `json:"pain"`
			Selling string `json:"selling"`
			Cta     string `json:"cta"`
		} `json:"structure"`
		ReusablePoints []string `json:"reusablePoints"`
		Adaptations    []string `json:"adaptations"`
	}
	if e := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &bd); e != nil {
		return nil, usage, fmt.Errorf("拆解结果格式异常:%w", e)
	}
	out.Title = bd.Title
	out.Summary = bd.Summary
	out.Structure = bd.Structure // 匿名结构体类型一致
	out.ReusablePoints = bd.ReusablePoints
	out.Adaptations = bd.Adaptations
	return &out, usage, nil
}

// addUsage 把一次调用的 usage 累加进汇总(两段式合并 token 与成本)。
func addUsage(dst *llm.Usage, src llm.Usage) {
	dst.TokensIn += src.TokensIn
	dst.TokensOut += src.TokensOut
	dst.CostCents += src.CostCents
}

// materialVideoURL 校验素材属于该工作台且为视频,返回其 URL;不合法返回空串。
func (s *AgentService) materialVideoURL(ctx context.Context, wsID, materialID uuid.UUID) string {
	var m model.Material
	if err := s.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ? AND type = ?", materialID, wsID, "VIDEO").
		First(&m).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(m.URL)
}

// downloadVideoBytes 从公读 URL 下载视频字节(限大小,防异常大文件)。交互式解析用默认 60s。
func downloadVideoBytes(ctx context.Context, url string) ([]byte, error) {
	return downloadVideoBytesTimeout(ctx, url, vaDownloadLimit)
}

// downloadVideoBytesTimeout 同上但超时可指定:后台管线拉热门视频(可能更大)用更长超时。
func downloadVideoBytesTimeout(ctx context.Context, url string, timeout time.Duration) ([]byte, error) {
	dctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(dctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, vaMaxVideoBytes+1))
	if err != nil {
		return nil, err
	}
	if len(b) > vaMaxVideoBytes {
		return nil, fmt.Errorf("视频超过 %dMB 上限", vaMaxVideoBytes>>20)
	}
	if len(b) == 0 {
		return nil, fmt.Errorf("视频内容为空")
	}
	return b, nil
}

// extractAudioAndFrames 用 ffmpeg 抽出单声道 mp3 音轨 + 至多 vaMaxFrames 帧画面(base64 data URL)。
// 音轨抽取失败(纯无声/缺 ffmpeg)返回 audio=nil 但不报错,让上层退化为"看帧解析"。
func extractAudioAndFrames(ctx context.Context, raw []byte) (*llm.AudioPart, []string, error) {
	dir, err := os.MkdirTemp("", "vanalyze-*")
	if err != nil {
		return nil, nil, fmt.Errorf("创建临时目录失败:%w", err)
	}
	defer os.RemoveAll(dir)
	inPath := dir + "/in.mp4"
	if err := os.WriteFile(inPath, raw, 0o600); err != nil {
		return nil, nil, fmt.Errorf("写入临时文件失败:%w", err)
	}

	// 音轨:截前 vaMaxSeconds 秒,降为单声道 16k,小体积便于内联传输。
	audioPath := dir + "/audio." + vaAudioFormat
	audioArgs := []string{
		"-y", "-t", vaMaxSeconds, "-i", inPath,
		"-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", vaAudioFormat, audioPath,
	}
	var audio *llm.AudioPart
	if runFFmpeg(ctx, audioArgs) {
		if ab, e := os.ReadFile(audioPath); e == nil && len(ab) > 0 {
			audio = &llm.AudioPart{
				Data:   base64.StdEncoding.EncodeToString(ab),
				Format: vaAudioFormat,
			}
		}
	}

	// 关键帧:每 8 秒一帧,缩到宽 480,最多 vaMaxFrames 帧。best-effort,失败就不带帧。
	frameArgs := []string{
		"-y", "-t", vaMaxSeconds, "-i", inPath,
		"-vf", "fps=1/8,scale=480:-1", "-frames:v", fmt.Sprintf("%d", vaMaxFrames),
		dir + "/frame_%02d.jpg",
	}
	var frames []string
	if runFFmpeg(ctx, frameArgs) {
		names, _ := os.ReadDir(dir)
		var files []string
		for _, n := range names {
			if strings.HasPrefix(n.Name(), "frame_") && strings.HasSuffix(n.Name(), ".jpg") {
				files = append(files, n.Name())
			}
		}
		sort.Strings(files)
		for _, fn := range files {
			if fb, e := os.ReadFile(dir + "/" + fn); e == nil && len(fb) > 0 {
				frames = append(frames, "data:image/jpeg;base64,"+base64.StdEncoding.EncodeToString(fb))
			}
		}
	}

	return audio, frames, nil
}

// runFFmpeg 跑一次 ffmpeg,成功返回 true;缺 ffmpeg / 失败 / 超时返回 false(沿用 video_post 的降级习惯)。
func runFFmpeg(ctx context.Context, args []string) bool {
	cctx, cancel := context.WithTimeout(ctx, vaFFmpegTimeout)
	defer cancel()
	if out, err := exec.CommandContext(cctx, "ffmpeg", args...).CombinedOutput(); err != nil {
		tail := string(out)
		if len(tail) > 400 {
			tail = tail[len(tail)-400:]
		}
		logger.Warn("[video-analysis] ffmpeg 处理失败",
			logger.String("err", err.Error()), logger.String("ffmpeg", tail))
		return false
	}
	return true
}
