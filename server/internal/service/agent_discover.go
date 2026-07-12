package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/llm"
)

const discoverAnalyzeSystem = `你是 发现猫 的"选品分析 Agent"，专门基于 EchoTik 真实销售数据做出海商品可行性分析。

**给你的事实块全部是 TikTok Shop 真实数据**，请直接基于这些数字推理，**不要瞎编更多数字**。

输出严格 JSON：
{
  "verdict": "RECOMMENDED" | "EVALUATING" | "AVOID",
  "verdictReason": "30 字以内的判断理由",
  "sellingPoints": ["卖点1", "卖点2", "卖点3"],
  "risks": ["风险1", "风险2"],
  "targetAudience": "目标人群一句话描述",
  "videoAngles": ["建议短视频角度1", "角度2", "角度3"],
  "roiEstimate": "毛估 ROI / 利润空间一句话"
}

要求：
- verdict 严格三选一
- sellingPoints / risks 各 2-3 条，每条不超过 25 字
- videoAngles 3 条，对应可拍的差异化方向
- 全部 JSON，**不要 markdown 包裹也不要解释文字**`

type discoverAnalyzeOut struct {
	Verdict        string   `json:"verdict"`
	VerdictReason  string   `json:"verdictReason"`
	SellingPoints  []string `json:"sellingPoints"`
	Risks          []string `json:"risks"`
	TargetAudience string   `json:"targetAudience"`
	VideoAngles    []string `json:"videoAngles"`
	RoiEstimate    string   `json:"roiEstimate"`
}

// DispatchDiscoverAnalyze 对某个 discover 商品发起 AI 可行性分析(异步 AgentTask)。
func (s *AgentService) DispatchDiscoverAnalyze(ctx context.Context, wsID uuid.UUID, productID, region string) (*model.AgentTask, error) {
	var dp model.DiscoverProduct
	err := s.db.WithContext(ctx).
		Where("provider = ? AND external_id = ? AND region = ?", "echotik", productID, region).
		First(&dp).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("找不到该商品(先在发现页浏览一次再分析)")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询商品失败", err)
	}

	meta := map[string]any{
		"source": "discover.echotik", "productId": productID, "region": region,
		"discoverProductId": dp.ID.String(),
	}
	mb, _ := json.Marshal(meta)
	t := model.AgentTask{
		WorkspaceID: wsID, Agent: model.AgentAnalyst, Status: model.TaskQueued,
		Input:    fmt.Sprintf("[Discover · %s] %s", region, dp.Name),
		Metadata: model.JSONB(mb),
	}
	// 发现页接力分析自起一条新会话(每次接力是独立线程)。
	cid, err := s.ensureConversation(ctx, wsID, nil, t.Input, model.AgentAnalyst)
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建会话失败", err)
	}
	t.ConversationID = cid
	if err := s.db.WithContext(ctx).Create(&t).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建分析任务失败", err)
	}
	go s.runDiscoverAnalyze(t.ID, dp, meta)
	return &t, nil
}

func (s *AgentService) runDiscoverAnalyze(taskID uuid.UUID, dp model.DiscoverProduct, baseMeta map[string]any) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			s.fail(ctx, taskID, fmt.Sprintf("panic: %v", r))
		}
	}()

	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).
		Updates(map[string]any{"status": model.TaskRunning, "started_at": time.Now()})

	if !s.llm.Configured() {
		s.fail(ctx, taskID, "AI 未配置:请在服务端 .env 设置 OPENROUTER_API_KEY")
		return
	}
	res, err := s.llm.Chat(ctx, discoverAnalyzeSystem, discoverFacts(dp), true, 1500)
	if err != nil {
		s.fail(ctx, taskID, err.Error())
		return
	}
	var out discoverAnalyzeOut
	if err := json.Unmarshal([]byte(llm.ExtractJSON(res.Content)), &out); err != nil {
		s.fail(ctx, taskID, "解析模型输出失败: "+err.Error())
		return
	}
	if out.Verdict != "RECOMMENDED" && out.Verdict != "AVOID" {
		out.Verdict = "EVALUATING"
	}

	verdictCn := map[string]string{"RECOMMENDED": "✅ 推荐", "EVALUATING": "⏳ 可评估", "AVOID": "⛔ 避开"}[out.Verdict]
	var b strings.Builder
	fmt.Fprintf(&b, "%s — %s\n\n", verdictCn, out.VerdictReason)
	if len(out.SellingPoints) > 0 {
		fmt.Fprintf(&b, "卖点：%s\n", strings.Join(out.SellingPoints, " / "))
	}
	if len(out.Risks) > 0 {
		fmt.Fprintf(&b, "风险：%s\n", strings.Join(out.Risks, " / "))
	}
	if out.TargetAudience != "" {
		fmt.Fprintf(&b, "人群：%s\n", out.TargetAudience)
	}
	if len(out.VideoAngles) > 0 {
		fmt.Fprintf(&b, "视频角度：%s\n", strings.Join(out.VideoAngles, " / "))
	}
	if out.RoiEstimate != "" {
		fmt.Fprintf(&b, "ROI：%s\n", out.RoiEstimate)
	}

	baseMeta["verdict"] = out.Verdict
	baseMeta["analysis"] = out
	mb, _ := json.Marshal(baseMeta)

	s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", taskID).Updates(map[string]any{
		"status": model.TaskDone, "output": b.String(), "finished_at": time.Now(),
		"metadata": model.JSONB(mb),
		"model":    res.Usage.Model, "tokens_in": res.Usage.TokensIn, "tokens_out": res.Usage.TokensOut, "cost_cents": res.Usage.CostCents,
	})
}

func discoverFacts(p model.DiscoverProduct) string {
	return strings.Join([]string{
		fmt.Sprintf("商品：%s", p.Name),
		fmt.Sprintf("区域：%s", p.Region),
		fmt.Sprintf("平均价：$%.2f（区间 $%.2f ~ $%.2f）", float64(p.AvgPriceCents)/100, float64(p.MinPriceCents)/100, float64(p.MaxPriceCents)/100),
		fmt.Sprintf("佣金率：%.1f%%", p.CommissionRate*100),
		fmt.Sprintf("总销量：%d", p.TotalSaleCnt),
		fmt.Sprintf("总 GMV：$%d", p.TotalSaleGmv/100),
		fmt.Sprintf("带货达人：%d 名", p.TotalIflCnt),
		fmt.Sprintf("挂车视频：%d 条", p.TotalVideoCnt),
		fmt.Sprintf("挂车直播：%d 场", p.TotalLiveCnt),
	}, "\n")
}
