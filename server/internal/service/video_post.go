package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

// 出片后处理:把口播逐句烧成硬字幕 + 末尾价格 CTA 尾帧。全程 best-effort,
// 任何失败/缺 ffmpeg 都返回原片,绝不让整条视频失败(沿用 rehost/封面的降级习惯)。

const ctaTailSec = 2 // CTA 尾帧时长(冻结尾帧 + 价格)
const ctaFontFamily = "Noto Sans"

// voCue 一句烧录字幕:起止秒 + 台词(目标市场母语)。
type voCue struct {
	StartSec float64
	EndSec   float64
	Text     string
}

var (
	// 兼容 ASCII " "、全角 “ ”、日式「」『』 引号:中文指令 + CJK 市场下 LLM 常把台词
	// 用全角/方引号包起来,只认 ASCII 引号会让这些片的字幕静默抽空(尤以日语高发)。
	reVOLine   = regexp.MustCompile(`VO:\s*["“「『]([^"”」』]+)["”」』]`)
	reShotTime = regexp.MustCompile(`\(\s*(\d+)\s*-\s*(\d+)\s*s?\s*\)`)
)

// parseVOCues 从 VideoPrompt 抽口播台词 + 时间轴:优先用每镜头 (a-bs);数量对不上或
// 无时间则按台词数在 durationSec 内均分。纯函数,可单测。无 VO 台词返回 nil。
func parseVOCues(prompt string, durationSec int) []voCue {
	var texts []string
	for _, m := range reVOLine.FindAllStringSubmatch(prompt, -1) {
		if t := strings.TrimSpace(m[1]); t != "" {
			texts = append(texts, t)
		}
	}
	if len(texts) == 0 {
		return nil
	}
	total := float64(durationSec)
	if total <= 0 {
		total = float64(len(texts)) * 3
	}

	var times [][2]float64
	for _, m := range reShotTime.FindAllStringSubmatch(prompt, -1) {
		a, _ := strconv.Atoi(m[1])
		b, _ := strconv.Atoi(m[2])
		times = append(times, [2]float64{float64(a), float64(b)})
	}

	cues := make([]voCue, 0, len(texts))
	if len(times) == len(texts) { // 时间轴和台词一一对应,直接用
		for i, t := range texts {
			cues = append(cues, voCue{StartSec: times[i][0], EndSec: times[i][1], Text: t})
		}
	} else { // 否则按台词长度加权分配总时长(长句占更久,比均分更贴近实际语速)
		totalLen := 0
		for _, t := range texts {
			totalLen += len([]rune(t))
		}
		at := 0.0
		for _, t := range texts {
			span := total / float64(len(texts))
			if totalLen > 0 {
				span = total * float64(len([]rune(t))) / float64(totalLen)
			}
			cues = append(cues, voCue{StartSec: at, EndSec: at + span, Text: t})
			at += span
		}
	}
	for i := range cues { // clamp 进 [0,total],保证 end>start
		if cues[i].StartSec < 0 {
			cues[i].StartSec = 0
		}
		if cues[i].EndSec > total {
			cues[i].EndSec = total
		}
		if cues[i].EndSec <= cues[i].StartSec {
			cues[i].EndSec = cues[i].StartSec + 1
		}
	}
	return cues
}

// assTime 把秒转 ASS 时间戳 H:MM:SS.cc。
func assTime(sec float64) string {
	if sec < 0 {
		sec = 0
	}
	whole := int(sec)
	cs := int((sec - float64(whole)) * 100)
	return fmt.Sprintf("%d:%02d:%02d.%02d", whole/3600, (whole%3600)/60, whole%60, cs)
}

// assEscape 清掉会破坏 ASS 事件行的字符(花括号是 override 块,换行折叠成空格)。
func assEscape(s string) string {
	s = strings.ReplaceAll(s, "{", "(")
	s = strings.ReplaceAll(s, "}", ")")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	return strings.TrimSpace(s)
}

// buildASS 生成 TikTok 风格硬字幕(底部偏上居中、粗体白字黑描边、大字号)。
// 字体名给 Noto Sans,libass 经 fontconfig 按字符自动回退(泰/越/阿拉伯等)。
func buildASS(cues []voCue, aspect string) string {
	resX, resY := 1080, 1920
	switch aspect {
	case "1:1":
		resX, resY = 1080, 1080
	case "16:9":
		resX, resY = 1920, 1080
	}
	fontSize := resY * 9 / 100 // ~9% 画高
	marginV := resY * 14 / 100 // 抬离底部,避开 TikTok UI
	marginLR := resX * 8 / 100 // 左右留白
	outline := fontSize/22 + 3

	var b strings.Builder
	b.WriteString("[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\n")
	fmt.Fprintf(&b, "PlayResX: %d\nPlayResY: %d\n\n", resX, resY)
	b.WriteString("[V4+ Styles]\n")
	b.WriteString("Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n")
	fmt.Fprintf(&b, "Style: Default,%s,%d,&H00FFFFFF,&H00000000,&H80000000,1,1,%d,1,2,%d,%d,%d,1\n\n",
		ctaFontFamily, fontSize, outline, marginLR, marginLR, marginV)
	b.WriteString("[Events]\n")
	b.WriteString("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
	for _, c := range cues {
		fmt.Fprintf(&b, "Dialogue: 0,%s,%s,Default,,0,0,0,,%s\n", assTime(c.StartSec), assTime(c.EndSec), assEscape(c.Text))
	}
	return b.String()
}

// drawtextEscape 转义 drawtext 文本里的反斜杠/单引号(filtergraph 单引号包裹,非 shell)。
func drawtextEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `'`, `\'`)
	return s
}

// ctaPriceText 取该视频关联商品的售价文案(用于 CTA 尾帧);无商品/无价返回空串。
func (s *VideoService) ctaPriceText(ctx context.Context, v model.Video) string {
	if v.ProductID == nil {
		return ""
	}
	var p model.Product
	if err := s.db.WithContext(ctx).
		First(&p, "id = ? AND workspace_id = ?", *v.ProductID, v.WorkspaceID).Error; err != nil {
		return ""
	}
	if p.PriceCents <= 0 {
		return ""
	}
	return fmt.Sprintf("$%.2f", float64(p.PriceCents)/100)
}

// probeDuration 用 ffprobe 取视频实际时长(秒);失败回落 fallbackSec。
func (s *VideoService) probeDuration(ctx context.Context, path string, fallbackSec int) float64 {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "ffprobe", "-v", "error",
		"-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path).Output()
	if err == nil {
		if d, e := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); e == nil && d > 0 {
			return d
		}
	}
	if fallbackSec > 0 {
		return float64(fallbackSec)
	}
	return 5
}

// postProcessVideo 出片后处理:①实拍开场拼接(真货镜头)②口播硬字幕 ③价格 CTA 尾帧,
// 返回 (处理后字节, 是否改动)。全程 best-effort:任一步失败只损失该步,绝不让整条视频失败。
//
// 字幕/CTA 先试一次同时烧(只编码一次,质量/耗时最优);若失败 —— 例如某条 filter 字体
// 解析挂掉 —— 且两段都在,则降级为「字幕」「CTA」两段独立 pass:一段失败不再连累另一段
// (旧实现把两者塞进同一条 ffmpeg,drawtext 一炸连字幕都没了)。代价是降级路径会二次编码。
func (s *VideoService) postProcessVideo(ctx context.Context, v model.Video, raw []byte) ([]byte, bool) {
	prompt := ""
	if v.Prompt != nil {
		prompt = *v.Prompt
	}
	// 实拍开场:把用户片段拼在最前;成功后字幕整体后移片段秒数。
	// 注意不回写 duration_sec:该列语义固定为「AI 生成秒数=计费秒数」,Retry/Rerender 按它
	// 重新扣费和提交;成片总时长由前端用 durationSec+realClipSec 计算展示。
	changed, offset := false, 0
	if v.RealClipURL != nil && strings.TrimSpace(*v.RealClipURL) != "" && v.RealClipSec > 0 {
		if merged, ok := s.prependRealClip(ctx, v, raw); ok {
			raw, changed, offset = merged, true, v.RealClipSec
		} else {
			logger.Warn("[video] 实拍开场拼接失败,退回纯 AI 成片", logger.String("video", v.ID.String()))
		}
	}
	totalSec := v.DurationSec + offset
	cues := parseVOCues(prompt, v.DurationSec)
	for i := range cues { // videoPrompt 的时间轴是 AI 部分自身计时,整体平移到实拍段之后
		cues[i].StartSec += float64(offset)
		cues[i].EndSec += float64(offset)
	}
	ctaPrice := s.ctaPriceText(ctx, v)
	if len(cues) == 0 && ctaPrice == "" {
		return raw, changed // 没字幕也没价格,只保留(可能的)拼接结果
	}

	// happy path:一次过同时烧字幕 + CTA。
	if out, ok := s.renderPost(ctx, v, raw, cues, ctaPrice, totalSec, "字幕+CTA"); ok {
		return out, true
	}
	// 只有「字幕 + CTA」都在时,拆段才有意义(单一组件没什么可拆);否则直接用当前片。
	if len(cues) == 0 || ctaPrice == "" {
		return raw, changed
	}
	// 降级:两段互不拖累 —— 字幕(libass)、CTA(drawtext)各自成败,任一字体/filter 故障只损失自己那段。
	cur := raw
	if out, ok := s.renderPost(ctx, v, cur, cues, "", totalSec, "字幕"); ok {
		cur, changed = out, true
	}
	if out, ok := s.renderPost(ctx, v, cur, nil, ctaPrice, totalSec, "CTA"); ok {
		cur, changed = out, true
	}
	return cur, changed
}

// renderPost 跑一次 ffmpeg,按传入的 cues / ctaPrice 烧字幕和/或价格 CTA 尾帧,
// 返回 (处理后字节, 是否成功)。两者都空、或 ffmpeg 缺失/失败/超时都返回 (raw, false)。
// fallbackDurSec 是 ffprobe 失败时的成片总时长兜底(实拍拼接后 ≠ v.DurationSec);
// stage 仅用于日志区分是哪一段(字幕+CTA / 字幕 / CTA)。
func (s *VideoService) renderPost(ctx context.Context, v model.Video, raw []byte, cues []voCue, ctaPrice string, fallbackDurSec int, stage string) ([]byte, bool) {
	if len(cues) == 0 && ctaPrice == "" {
		return raw, false
	}
	dir, err := os.MkdirTemp("", "vpost-*")
	if err != nil {
		return raw, false
	}
	defer os.RemoveAll(dir)
	inPath := dir + "/in.mp4"
	outPath := dir + "/out.mp4"
	if err := os.WriteFile(inPath, raw, 0o600); err != nil {
		return raw, false
	}

	vf := make([]string, 0, 5)
	withCTA := ctaPrice != ""
	if withCTA { // 冻结尾帧 ctaTailSec 秒,腾出 CTA 展示窗
		vf = append(vf, fmt.Sprintf("tpad=stop_mode=clone:stop_duration=%d", ctaTailSec))
	}
	if len(cues) > 0 {
		assPath := dir + "/subs.ass"
		if err := os.WriteFile(assPath, []byte(buildASS(cues, v.AspectRatio)), 0o600); err != nil {
			return raw, false
		}
		vf = append(vf, "ass="+assPath)
	}
	if withCTA {
		dur := s.probeDuration(ctx, inPath, fallbackDurSec)
		en := fmt.Sprintf("enable='gte(t,%.2f)'", dur)
		vf = append(vf,
			fmt.Sprintf("drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill:%s", en),
			fmt.Sprintf("drawtext=font=%s:text='%s':fontsize=h/7:fontcolor=white:borderw=6:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2-h/14:%s",
				ctaFontFamily, drawtextEscape(ctaPrice), en),
			fmt.Sprintf("drawtext=font=%s:text='%s':fontsize=h/11:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2+h/12:%s",
				ctaFontFamily, drawtextEscape("▾"), en),
		)
	}

	args := []string{"-y", "-i", inPath, "-vf", strings.Join(vf, ","),
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20"}
	if withCTA {
		args = append(args, "-af", fmt.Sprintf("apad=pad_dur=%d", ctaTailSec), "-c:a", "aac")
	} else {
		args = append(args, "-c:a", "copy")
	}
	args = append(args, "-movflags", "+faststart", outPath)

	cctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	if out, err := exec.CommandContext(cctx, "ffmpeg", args...).CombinedOutput(); err != nil {
		tail := string(out)
		if len(tail) > 400 {
			tail = tail[len(tail)-400:]
		}
		logger.Warn("[video] 后处理失败,用原片",
			logger.String("video", v.ID.String()), logger.String("stage", stage),
			logger.String("err", err.Error()), logger.String("ffmpeg", tail))
		return raw, false
	}
	processed, err := os.ReadFile(outPath)
	if err != nil || len(processed) == 0 {
		return raw, false
	}
	return processed, true
}

// ── 实拍开场拼接(真货镜头) ────────────────────────────────────────────────

const realClipMaxBytes = 100 << 20 // 实拍片段下载上限(素材上传限 50MB,这里放宽一倍兜底)

// fetchBytes 拉取一个公网 URL(实拍片段在 COS 上),带大小上限。
func fetchBytes(ctx context.Context, rawURL string, maxBytes int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("下载实拍片段失败: HTTP %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("实拍片段超过 %dMB", maxBytes>>20)
	}
	return data, nil
}

// probeVideoMeta 取视频首条视频流的宽/高/帧率(如 1080,1920,30/1);失败返回 ok=false。
func (s *VideoService) probeVideoMeta(ctx context.Context, path string) (w, h int, fps string, ok bool) {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "ffprobe", "-v", "error", "-select_streams", "v:0",
		"-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", path).Output()
	if err != nil {
		return 0, 0, "", false
	}
	parts := strings.Split(strings.TrimSpace(string(out)), ",")
	if len(parts) < 3 {
		return 0, 0, "", false
	}
	w, _ = strconv.Atoi(parts[0])
	h, _ = strconv.Atoi(parts[1])
	fps = strings.TrimSpace(parts[2])
	if w <= 0 || h <= 0 {
		return 0, 0, "", false
	}
	if fps == "" || fps == "0/0" {
		fps = "24"
	}
	return w, h, fps, true
}

// prependRealClip 把实拍片段的前 RealClipSec 秒原样拼在 AI 成片前(真货开场,保留原声)。
// 实拍归一到 AI 成片的分辨率/帧率(等比缩放+黑边),音频统一 44.1k 立体声;
// 实拍无音轨时降级用静音轨重试一次。任何失败返回 (raw,false),成片退回纯 AI 版。
func (s *VideoService) prependRealClip(ctx context.Context, v model.Video, raw []byte) ([]byte, bool) {
	clipSec := v.RealClipSec
	dctx, dcancel := context.WithTimeout(ctx, 90*time.Second)
	clip, err := fetchBytes(dctx, strings.TrimSpace(*v.RealClipURL), realClipMaxBytes)
	dcancel()
	if err != nil {
		logger.Warn("[video] 实拍片段下载失败", logger.String("video", v.ID.String()), logger.Err(err))
		return raw, false
	}

	dir, err := os.MkdirTemp("", "vclip-*")
	if err != nil {
		return raw, false
	}
	defer os.RemoveAll(dir)
	clipPath, aiPath, outPath := dir+"/clip.bin", dir+"/ai.mp4", dir+"/out.mp4"
	if os.WriteFile(clipPath, clip, 0o600) != nil || os.WriteFile(aiPath, raw, 0o600) != nil {
		return raw, false
	}
	w, h, fps, ok := s.probeVideoMeta(ctx, aiPath)
	if !ok {
		return raw, false
	}

	// 实拍段视频链:截取→等比缩放进 AI 画幅(不裁切,差比例补黑边)→对齐帧率/像素格式。
	vChain := fmt.Sprintf(
		"[0:v]trim=0:%d,setpts=PTS-STARTPTS,scale=%d:%d:force_original_aspect_ratio=decrease,"+
			"pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black,fps=%s,setsar=1,format=yuv420p[v0];"+
			"[1:v]setsar=1,format=yuv420p[v1]",
		clipSec, w, h, w, h, fps)
	aiAudio := "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a1]"
	run := func(clipAudio, tail string, extraInputs ...string) bool {
		args := []string{"-y", "-i", clipPath, "-i", aiPath}
		args = append(args, extraInputs...)
		args = append(args,
			"-filter_complex", vChain+";"+clipAudio+";"+aiAudio+";"+tail,
			"-map", "[v]", "-map", "[a]",
			"-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
			"-c:a", "aac", "-movflags", "+faststart", outPath)
		cctx, cancel := context.WithTimeout(ctx, 120*time.Second)
		defer cancel()
		if out, err := exec.CommandContext(cctx, "ffmpeg", args...).CombinedOutput(); err != nil {
			tailLog := string(out)
			if len(tailLog) > 400 {
				tailLog = tailLog[len(tailLog)-400:]
			}
			logger.Warn("[video] 实拍拼接 ffmpeg 失败",
				logger.String("video", v.ID.String()), logger.String("ffmpeg", tailLog))
			return false
		}
		return true
	}
	concatTail := "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]"
	// 先按「实拍自带音轨」拼;实拍无声(手机静音拍摄常见)时用静音轨重试。
	okRun := run(fmt.Sprintf(
		"[0:a]atrim=0:%d,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0]",
		clipSec), concatTail)
	if !okRun {
		okRun = run("[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a0]", concatTail,
			"-f", "lavfi", "-t", strconv.Itoa(clipSec), "-i", "anullsrc=r=44100:cl=stereo")
	}
	if !okRun {
		return raw, false
	}
	merged, err := os.ReadFile(outPath)
	if err != nil || len(merged) == 0 {
		return raw, false
	}
	return merged, true
}
