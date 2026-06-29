package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/model"
)

// listingBatchMax 单批最多处理的商品图数(控成本/出图并发;超出引导用户分批)。
const listingBatchMax = 12

// ListingBatchItem 批量里单张图的产出:一张自建商品卡 + 一个 LISTING 任务。
type ListingBatchItem struct {
	MaterialID uuid.UUID `json:"materialId"`
	ProductID  uuid.UUID `json:"productId"`
	TaskID     uuid.UUID `json:"taskId"`
	Title      string    `json:"title"`
}

// ListingBatchResult 批量结果:前端据此定位新建商品卡并轮询各自的 Listing 进度。
type ListingBatchResult struct {
	BatchID uuid.UUID          `json:"batchId"`
	Items   []ListingBatchItem `json:"items"`
}

// CreateListingBatch 批量「把我拍的商品图变成商品」:
// 每张已上传到素材库的图 → 建一张自建商品卡(DiscoverProductID 为空,封面先用用户原图,
// 卡片即刻有图)→ 派一个 LISTING 任务(autoImages,文案+主图一起出,无需二次确认)。
// 商品卡随各自任务异步「生成中 → 文案就绪 → 成品图就绪」自填充(前端轮询商品列表的 listingStatus)。
func (s *AgentService) CreateListingBatch(ctx context.Context, wsID uuid.UUID, materialIDs []uuid.UUID, promptExtra string) (*ListingBatchResult, error) {
	// 去重 + 上限。
	seen := map[uuid.UUID]bool{}
	ids := make([]uuid.UUID, 0, len(materialIDs))
	for _, id := range materialIDs {
		if id == uuid.Nil || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, apperr.BadRequest("请至少选择一张商品图")
	}
	if len(ids) > listingBatchMax {
		return nil, apperr.BadRequest(fmt.Sprintf("单批最多 %d 张,请分批处理", listingBatchMax))
	}

	// 整批前置校验,只预检「文案」这部分硬额度(每张派活一笔):不够直接整批拒,一张不建,
	// 避免建到一半余额耗尽留下半成品。出图为尽力而为(逐任务在自动接力时再扣;某张额度不足时
	// 该商品只出文案不出图,见 execute 的 AutoImages 分支),故不纳入此处硬预检。
	need := model.CreditsFor(model.UsageAgentTask, len(ids))
	if err := s.quota.EnsureBudget(ctx, wsID, need); err != nil {
		return nil, err
	}

	prompt := strings.TrimSpace(promptExtra)
	if prompt == "" {
		prompt = "看这张商品照片,生成一套可直接上架的 TikTok Shop Listing(英文标题/五点卖点/A+ 图文/主图)。"
	}

	res := &ListingBatchResult{BatchID: uuid.New()}
	for _, mid := range ids {
		url := s.materialImageURL(ctx, wsID, mid)
		if url == "" {
			// 非本工作台素材 / 非图片类型:跳过,不建商品、不计费。
			logger.Warn("[agent] 批量 Listing 跳过无效素材", logger.String("material", mid.String()))
			continue
		}
		emoji := "🛍️"
		prod := model.Product{
			WorkspaceID: wsID,
			Title:       s.materialTitle(ctx, wsID, mid),
			Category:    "我的商品",
			Emoji:       &emoji,
			CostSource:  model.CostSourceEstimate,
			Status:      model.ProductEvaluating,
			CoverURL:    &url, // 先用用户原图,商品卡即刻有图;AI 成品图随 Listing 生成后在卡内可选用。
		}
		if err := s.db.WithContext(ctx).Create(&prod).Error; err != nil {
			logger.Warn("[agent] 批量建商品失败,跳过该图",
				logger.String("material", mid.String()), logger.Err(err))
			continue
		}
		pid := prod.ID
		t, err := s.Create(ctx, wsID, model.AgentListing, prompt, AgentCreateOpts{
			ProductID:  &pid,
			MaterialID: &mid,
			AutoImages: true,
		})
		if err != nil {
			// 额度在 Create 内逐笔权威校验:并发等极端情况下中途耗尽即停,返回已建部分。
			// 已建商品保留(用户可后续在商品卡上手动「做 Listing」补齐)。
			logger.Warn("[agent] 批量派 Listing 中止", logger.Err(err))
			break
		}
		res.Items = append(res.Items, ListingBatchItem{
			MaterialID: mid, ProductID: pid, TaskID: t.ID, Title: prod.Title,
		})
	}
	if len(res.Items) == 0 {
		return nil, apperr.BadRequest("没有可处理的商品图,请确认已上传图片素材")
	}
	return res, nil
}

// materialTitle 用素材文件名(去扩展名)作自建商品的临时标题;Listing 出文案后用户可改名。
func (s *AgentService) materialTitle(ctx context.Context, wsID, materialID uuid.UUID) string {
	var m model.Material
	if err := s.db.WithContext(ctx).Select("original_name").
		Where("id = ? AND workspace_id = ?", materialID, wsID).First(&m).Error; err != nil {
		return "我的商品"
	}
	name := strings.TrimSpace(m.OriginalName)
	if i := strings.LastIndex(name, "."); i > 0 {
		name = strings.TrimSpace(name[:i])
	}
	if name == "" {
		return "我的商品"
	}
	return name
}
