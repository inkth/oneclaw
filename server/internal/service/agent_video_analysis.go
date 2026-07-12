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

const videoAnalysisSystem = `你是 发现猫 的"带货视频解析 Agent",服务 TikTok Shop 跨境卖家。
输入是一条带货短视频的音轨(口播)和若干帧画面。请完成:
1. 逐句转录口播原文(保留原始语言,不要翻译),按出现顺序切句并标注大致时间码(如 0:00-0:03)。
2. 把每句口播翻译成自然流畅的中文(地道表达,不要直译腔)。
3. 用中文拆解这条视频的带货结构:钩子(开头怎么抓注意力)、痛点(戳了什么需求/焦虑)、卖点(核心卖点怎么呈现)、CTA(结尾怎么促单)。
4. 提炼这条视频值得复用的套路要点(reusablePoints)。
5. 给出把它改编成中国卖家自己商品的具体建议(adaptations)。

严格要求:
- 只输出合法 JSON,结构严格如下,不要任何额外文字、解释或 markdown 围栏。
- 没有口播 / 纯音乐时 lines 返回空数组,summary 注明"无口播,以下基于画面",仍尽量给出 structure 与 adaptations。
- lang 用中文写原始语言名(如 英语 / 印尼语 / 泰语 / 越南语)。
- reusablePoints 与 adaptations 各给 3-5 条,具体可落地,不要空话。

JSON 结构:
{
  "lang": "原始口播语言中文名",
  "title": "给视频起的中文小标题",
  "summary": "一句话:卖什么、靠什么打动人",
  "lines": [{"t": "0:00-0:03", "original": "原文口播", "zh": "中文翻译"}],
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

	user := "请解析这条带货视频。"
	if f := strings.TrimSpace(input); f != "" && f != "解析视频脚本" {
		user += "用户特别想关注:" + f
	}

	// 用 ReviewModel(gemini-3.5-flash,支持 audio 输入)做多模态解析;prod 经代理出网。
	res, err := s.llm.ChatAV(ctx, s.llm.ReviewModel(), videoAnalysisSystem, user, audio, frames, true, 4000)
	if err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("视频解析失败:%w", err)
	}

	var out videoAnalysisOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		return "", nil, llm.Usage{}, fmt.Errorf("解析结果格式异常:%w", err)
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

	return b.String(), meta, res.Usage, nil
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
