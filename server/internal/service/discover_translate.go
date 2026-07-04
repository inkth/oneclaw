package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/service/llm"
)

// 选品板块外文本地化:商品标题、短视频文案是 EchoTik 直传的目标市场语言(英/泰/越…),
// 对中国选品用户是理解障碍。落库后投递后台 worker,批量调 LLM(默认 deepseek,便宜且国内可达)
// 译成简体中文回填 name_zh/desc_zh,读路径零阻塞。前端优先展示中文、原文作副标题备查(搜同款/上架仍需原文)。
//
// 只译不覆盖:name_zh/desc_zh 一旦非空即不再重译(标题/文案极少变动);要强制重译走 --backfill-translations。
// 店铺名/达人昵称不译(是找人对号的专有名词,译了反而搜不到),故此处只处理商品与视频两类。

const (
	translateWorkers   = 2  // 后台翻译 worker 数(LLM 调用不抢 EchoTik 带宽,少量即可)
	translateBatchSize = 20 // 单次 LLM 调用翻译的条数上限
)

// translateJob 一条待翻译记录:回填到 Table.Column WHERE id=ID。
type translateJob struct {
	Table  string
	Column string
	ID     uuid.UUID
	Text   string
}

func (j translateJob) key() string { return j.Table + "|" + j.ID.String() }

// StartTranslate 启动外文翻译后台 worker;ctx 为应用生命周期。未配置 LLM 时直接跳过(前端退回原文)。
func (s *DiscoverService) StartTranslate(ctx context.Context) {
	if s.llm == nil || !s.llm.Configured() {
		logger.Warn("[job] LLM 未配置,选品外文翻译 worker 不启动(前端展示原文)")
		return
	}
	for i := 0; i < translateWorkers; i++ {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case jobs := <-s.translateCh:
					s.runTranslate(ctx, jobs)
					s.clearTranslateInflight(jobs)
				}
			}
		}()
	}
	logger.Info("[job] 选品外文翻译 worker 已启动", logger.Int("workers", translateWorkers))
}

// enqueueTranslate 非阻塞投递待翻译行;inflight 跨请求去重(按 table+id),channel 满则丢弃(下次落库会再触发)。
func (s *DiscoverService) enqueueTranslate(jobs []translateJob) {
	if s.translateCh == nil || s.llm == nil || len(jobs) == 0 {
		return
	}
	s.translateMu.Lock()
	todo := make([]translateJob, 0, len(jobs))
	for _, j := range jobs {
		if j.Text == "" {
			continue
		}
		if _, ok := s.translateInflight[j.key()]; ok {
			continue
		}
		s.translateInflight[j.key()] = struct{}{}
		todo = append(todo, j)
	}
	s.translateMu.Unlock()
	if len(todo) == 0 {
		return
	}
	select {
	case s.translateCh <- todo:
	default:
		s.clearTranslateInflight(todo) // 队列满,放弃这批(不阻塞调用方)
	}
}

func (s *DiscoverService) clearTranslateInflight(jobs []translateJob) {
	s.translateMu.Lock()
	for _, j := range jobs {
		delete(s.translateInflight, j.key())
	}
	s.translateMu.Unlock()
}

// runTranslate 把一批 job 按 translateBatchSize 切块,逐块调 LLM 翻译并回填。
func (s *DiscoverService) runTranslate(ctx context.Context, jobs []translateJob) {
	for start := 0; start < len(jobs); start += translateBatchSize {
		end := start + translateBatchSize
		if end > len(jobs) {
			end = len(jobs)
		}
		s.translateChunk(ctx, jobs[start:end])
	}
}

const translateSystemPrompt = `你是跨境电商本地化翻译。把用户给的若干条 TikTok 商品标题或短视频文案,翻译成简洁、自然、地道的简体中文,帮助中国选品用户快速看懂卖点。要求:
1) 只翻译,不解释、不补充、不添加营销话术;
2) 保留品牌名、型号、规格、尺寸、单位等专有信息(可中英并存);
3) 去掉无意义的标签堆砌与 emoji,保留核心信息;
4) 每条译文不超过原文信息量,不要展开;
5) 严格按输入顺序、逐条对应返回。
只返回 JSON,格式:{"items":[{"i":0,"z":"中文译文"}, ...]},i 为输入序号,z 为译文。`

// translateChunk 调 LLM 翻译一小批(≤translateBatchSize),按 id 回填对应列。任一步失败即整批放弃(inflight 已在外层清理,下次落库会再投递)。
func (s *DiscoverService) translateChunk(ctx context.Context, jobs []translateJob) {
	if len(jobs) == 0 {
		return
	}
	type reqItem struct {
		I int    `json:"i"`
		T string `json:"t"`
	}
	items := make([]reqItem, len(jobs))
	for i, j := range jobs {
		items[i] = reqItem{I: i, T: j.Text}
	}
	payload, _ := json.Marshal(map[string]any{"items": items})

	cctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	// 专用翻译模型(默认 deepseek/deepseek-v4-flash,快且便宜);未配置时 ChatWithModel 回退默认文本模型。
	res, err := s.llm.ChatWithModel(cctx, s.llm.TranslateModel(), translateSystemPrompt, string(payload), true, 2000)
	if err != nil {
		logger.Warn("[translate] LLM 翻译失败", logger.Int("n", len(jobs)), logger.Err(err))
		return
	}

	var parsed struct {
		Items []struct {
			I int    `json:"i"`
			Z string `json:"z"`
		} `json:"items"`
	}
	if e := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &parsed); e != nil {
		logger.Warn("[translate] 译文 JSON 解析失败", logger.Err(e))
		return
	}

	updated := 0
	for _, it := range parsed.Items {
		if it.I < 0 || it.I >= len(jobs) || it.Z == "" {
			continue
		}
		j := jobs[it.I]
		// 仅回填仍为空的行,避免覆盖并发写入的既有译文;按主键更新,零副作用。
		if e := s.db.WithContext(ctx).Table(j.Table).
			Where("id = ? AND "+j.Column+" = ''", j.ID).
			Update(j.Column, it.Z).Error; e != nil {
			logger.Warn("[translate] 回填译文失败", logger.String("table", j.Table), logger.Err(e))
			continue
		}
		updated++
	}
	if updated > 0 {
		logger.Info("[translate] 外文字段已翻译回填", logger.Int("updated", updated))
	}
}

// BackfillTranslations 一次性回填存量:扫商品标题(name_zh 空)与视频文案(desc_zh 空),分批投递翻译。
// 用法:docker compose run --rm go-api ./server --backfill-translations。幂等——已翻译的行 zh 非空即跳过。
func (s *DiscoverService) BackfillTranslations(ctx context.Context) (queued int, err error) {
	if s.db == nil {
		return 0, nil
	}
	if s.llm == nil || !s.llm.Configured() {
		logger.Warn("[backfill] LLM 未配置,翻译回填跳过")
		return 0, nil
	}

	// 商品标题
	type prow struct {
		ID   uuid.UUID
		Name string
	}
	var prods []prow
	if e := s.db.WithContext(ctx).Table("discover_products").
		Select("id", "name").
		Where("name_zh = '' AND name <> ''").
		Find(&prods).Error; e != nil {
		return queued, e
	}
	for start := 0; start < len(prods); start += translateBatchSize {
		end := start + translateBatchSize
		if end > len(prods) {
			end = len(prods)
		}
		batch := make([]translateJob, 0, end-start)
		for _, r := range prods[start:end] {
			batch = append(batch, translateJob{Table: "discover_products", Column: "name_zh", ID: r.ID, Text: r.Name})
		}
		s.translateChunk(ctx, batch) // 同步逐批(一次性命令,不走 channel),自带限速
		queued += len(batch)
	}

	// 视频文案
	type vrow struct {
		ID   uuid.UUID
		Desc string `gorm:"column:video_desc"`
	}
	var vids []vrow
	if e := s.db.WithContext(ctx).Table("discover_videos").
		Select("id", "video_desc").
		Where("desc_zh = '' AND video_desc <> ''").
		Find(&vids).Error; e != nil {
		return queued, e
	}
	for start := 0; start < len(vids); start += translateBatchSize {
		end := start + translateBatchSize
		if end > len(vids) {
			end = len(vids)
		}
		batch := make([]translateJob, 0, end-start)
		for _, r := range vids[start:end] {
			batch = append(batch, translateJob{Table: "discover_videos", Column: "desc_zh", ID: r.ID, Text: r.Desc})
		}
		s.translateChunk(ctx, batch)
		queued += len(batch)
	}

	logger.Info("[backfill] 翻译回填完成", logger.Int("products", len(prods)), logger.Int("videos", len(vids)))
	return queued, nil
}
