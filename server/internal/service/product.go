package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/model"
	"github.com/oneclaw/server/internal/service/echotik"
)

type ProductService struct {
	db *gorm.DB
}

func NewProductService(db *gorm.DB) *ProductService {
	return &ProductService{db: db}
}

type ProductInput struct {
	Title        string  `json:"title" binding:"required"`
	Category     string  `json:"category"`
	Emoji        *string `json:"emoji"`
	PriceCents   int     `json:"priceCents"`
	CostCents    int     `json:"costCents"`
	MarginPct    int     `json:"marginPct"`
	RoiScore     int     `json:"roiScore"`
	MonthlySales int     `json:"monthlySales"`
	TrendDelta   int     `json:"trendDelta"`
	Status       string  `json:"status"`
	Note         *string `json:"note"`
}

// ProductPatch 局部更新,nil 字段不改。
type ProductPatch struct {
	Title        *string `json:"title"`
	Category     *string `json:"category"`
	Emoji        *string `json:"emoji"`
	PriceCents   *int    `json:"priceCents"`
	CostCents    *int    `json:"costCents"`
	MarginPct    *int    `json:"marginPct"`
	RoiScore     *int    `json:"roiScore"`
	MonthlySales *int    `json:"monthlySales"`
	TrendDelta   *int    `json:"trendDelta"`
	Status       *string `json:"status"`
	Note         *string `json:"note"`
	CoverURL     *string `json:"coverUrl"` // 回写商品主图(Listing 出图设为主图)
}

// ProductListItem 列表项:商品本体 + 关联 EchoTik 主图(coverUrl),供前端选择器显示缩略图。
// ListingStatus:该商品最近一次 Listing 生成的进度(自建商品批量出 Listing 时,卡片据此显示
// 「生成中 / 出图中 / 已就绪 / 失败」并轮询);无 Listing 任务时为空。
type ProductListItem struct {
	model.Product
	CoverURL      string `json:"coverUrl,omitempty"`
	ListingStatus string `json:"listingStatus,omitempty"` // GENERATING | IMAGING | READY | FAILED | ""
}

func (s *ProductService) List(ctx context.Context, wsID uuid.UUID) ([]ProductListItem, error) {
	var items []model.Product
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("created_at DESC").
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询商品失败", err)
	}

	// 批量取关联 DiscoverProduct 的主图(CoverUrls[0]),一次查询避免 N+1。
	dpIDs := make([]uuid.UUID, 0, len(items))
	for _, p := range items {
		if p.DiscoverProductID != nil {
			dpIDs = append(dpIDs, *p.DiscoverProductID)
		}
	}
	coverByDP := make(map[uuid.UUID]string, len(dpIDs))
	if len(dpIDs) > 0 {
		var dps []model.DiscoverProduct
		if err := s.db.WithContext(ctx).
			Select("id", "cover_urls").
			Where("id IN ?", dpIDs).
			Find(&dps).Error; err == nil {
			for _, dp := range dps {
				if len(dp.CoverUrls) == 0 {
					continue
				}
				var urls []string
				if json.Unmarshal(dp.CoverUrls, &urls) == nil && len(urls) > 0 {
					coverByDP[dp.ID] = strings.TrimSpace(urls[0])
				}
			}
		}
	}

	// 批量取每个商品最近一条 LISTING 任务的进度,一次查询避免 N+1。
	listingStatus := s.listingStatusByProduct(ctx, wsID)

	out := make([]ProductListItem, len(items))
	for i, p := range items {
		out[i] = ProductListItem{Product: p}
		// 回写的主图优先;否则回退 EchoTik 关联主图。
		if p.CoverURL != nil && strings.TrimSpace(*p.CoverURL) != "" {
			out[i].CoverURL = *p.CoverURL
		} else if p.DiscoverProductID != nil {
			out[i].CoverURL = coverByDP[*p.DiscoverProductID]
		}
		out[i].ListingStatus = listingStatus[p.ID.String()]
	}
	return out, nil
}

// listingStatusByProduct 返回每个商品最近一条 LISTING 任务的派生进度(productId → 状态)。
// LISTING 任务把 productId 存在 metadata 里;按创建时间倒序,每个商品只取最新一条。
func (s *ProductService) listingStatusByProduct(ctx context.Context, wsID uuid.UUID) map[string]string {
	type row struct {
		ProductID    string
		Status       string
		ImagesStatus string
	}
	var rows []row
	if err := s.db.WithContext(ctx).Model(&model.AgentTask{}).
		Select("metadata->>'productId' AS product_id, status, metadata->>'imagesStatus' AS images_status").
		Where("workspace_id = ? AND agent = ? AND metadata->>'productId' <> ''", wsID, model.AgentListing).
		Order("created_at DESC").
		Scan(&rows).Error; err != nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		if r.ProductID == "" {
			continue
		}
		if _, seen := out[r.ProductID]; seen {
			continue // 仅取最新一条
		}
		out[r.ProductID] = deriveListingStatus(r.Status, r.ImagesStatus)
	}
	return out
}

// deriveListingStatus 把(任务状态, 出图状态)折成前端用的 Listing 进度。
// 文案完成但出图还在跑 → IMAGING;出图失败仍算 READY(文案可用,出图可手动重试)。
func deriveListingStatus(taskStatus, imagesStatus string) string {
	switch taskStatus {
	case model.TaskQueued, model.TaskRunning:
		return "GENERATING"
	case model.TaskFailed:
		return "FAILED"
	case model.TaskDone:
		switch imagesStatus {
		case listingImagesPending, listingImagesRunning:
			return "IMAGING"
		default:
			return "READY"
		}
	}
	return ""
}

func (s *ProductService) Create(ctx context.Context, wsID uuid.UUID, in ProductInput) (*model.Product, error) {
	status := in.Status
	if status == "" {
		status = model.ProductEvaluating
	}
	p := model.Product{
		WorkspaceID:  wsID,
		Title:        in.Title,
		Category:     in.Category,
		Emoji:        in.Emoji,
		PriceCents:   in.PriceCents,
		CostCents:    in.CostCents,
		MarginPct:    in.MarginPct,
		RoiScore:     in.RoiScore,
		MonthlySales: in.MonthlySales,
		TrendDelta:   in.TrendDelta,
		Status:       status,
		Note:         in.Note,
	}
	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "创建商品失败", err)
	}
	return &p, nil
}

func (s *ProductService) get(ctx context.Context, wsID, pid uuid.UUID) (*model.Product, error) {
	var p model.Product
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", pid, wsID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("商品不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询商品失败", err)
	}
	return &p, nil
}

func (s *ProductService) Update(ctx context.Context, wsID, pid uuid.UUID, patch ProductPatch) (*model.Product, error) {
	p, err := s.get(ctx, wsID, pid)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if patch.Title != nil {
		updates["title"] = *patch.Title
	}
	if patch.Category != nil {
		updates["category"] = *patch.Category
	}
	if patch.Emoji != nil {
		updates["emoji"] = *patch.Emoji
	}
	if patch.PriceCents != nil {
		updates["price_cents"] = *patch.PriceCents
	}
	if patch.CostCents != nil {
		updates["cost_cents"] = *patch.CostCents
		// 用户回填真实进货价:标记成本来源为「真实」。
		updates["cost_source"] = model.CostSourceManual
	}
	// 成本或售价变化时,服务端据最新值重算毛利(忽略客户端传入的 margin,服务端为准);
	// 仅当二者都未变才尊重显式 margin 覆盖。
	if patch.CostCents != nil || patch.PriceCents != nil {
		price := p.PriceCents
		if patch.PriceCents != nil {
			price = *patch.PriceCents
		}
		cost := p.CostCents
		if patch.CostCents != nil {
			cost = *patch.CostCents
		}
		updates["margin_pct"] = echotik.EstimateMarginPct(price, cost)
	} else if patch.MarginPct != nil {
		updates["margin_pct"] = *patch.MarginPct
	}
	if patch.RoiScore != nil {
		updates["roi_score"] = *patch.RoiScore
	}
	if patch.MonthlySales != nil {
		updates["monthly_sales"] = *patch.MonthlySales
	}
	if patch.TrendDelta != nil {
		updates["trend_delta"] = *patch.TrendDelta
	}
	if patch.Status != nil {
		updates["status"] = *patch.Status
	}
	if patch.Note != nil {
		updates["note"] = *patch.Note
	}
	if patch.CoverURL != nil {
		updates["cover_url"] = *patch.CoverURL
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(p).Updates(updates).Error; err != nil {
			return nil, apperr.Wrap(apperr.CodeInternal, "更新商品失败", err)
		}
	}
	return s.get(ctx, wsID, pid)
}

func (s *ProductService) Delete(ctx context.Context, wsID, pid uuid.UUID) error {
	res := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", pid, wsID).Delete(&model.Product{})
	if res.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "删除商品失败", res.Error)
	}
	if res.RowsAffected == 0 {
		return apperr.NotFound("商品不存在")
	}
	return nil
}

// ── 出海包:把一个商品「手动发到 TikTok Shop」要用的料聚到一处 ──────────────

type PublishKitVideo struct {
	ID           uuid.UUID `json:"id"`
	Title        string    `json:"title"`
	VideoURL     *string   `json:"videoUrl,omitempty"`
	ThumbnailURL *string   `json:"thumbnailUrl,omitempty"`
}

type PublishKitAplus struct {
	Heading     string `json:"heading"`
	Body        string `json:"body"`
	ImagePrompt string `json:"imagePrompt"`
}

type PublishKitListing struct {
	TaskID        uuid.UUID         `json:"taskId"`
	Title         string            `json:"title"`
	SellingPoints []string          `json:"sellingPoints"`
	Hashtags      []string          `json:"hashtags"`
	AplusSections []PublishKitAplus `json:"aplusSections,omitempty"`
	Images        []string          `json:"images,omitempty"`
	ImagePrompts  []string          `json:"imagePrompts,omitempty"`
	ImagesStatus  string            `json:"imagesStatus,omitempty"` // PENDING|RUNNING|DONE|FAILED;详情页据此显示「补主图」
}

type PublishKit struct {
	Product struct {
		ID         uuid.UUID `json:"id"`
		Title      string    `json:"title"`
		Emoji      *string   `json:"emoji,omitempty"`
		Status     string    `json:"status"`
		PriceCents int       `json:"priceCents"`
		CostCents  int       `json:"costCents"`
		CostSource string    `json:"costSource"`
		MarginPct  int       `json:"marginPct"`
		Note       *string   `json:"note,omitempty"`
		CoverURL   string    `json:"coverUrl,omitempty"` // 当前商品主图(自建商品初始=用户原图)
	} `json:"product"`
	Videos  []PublishKitVideo  `json:"videos"`
	Listing *PublishKitListing `json:"listing,omitempty"`
}

// PublishKit 聚合一个商品的发布素材:已出片的成片 + 最近一条 Listing(标题/五点/标签/主图)。
// 产品不真发布,这里是把用户「手动发」要用的东西一次给齐(下载 + 一键复制)。
func (s *ProductService) PublishKit(ctx context.Context, wsID, pid uuid.UUID) (*PublishKit, error) {
	p, err := s.get(ctx, wsID, pid)
	if err != nil {
		return nil, err
	}
	kit := &PublishKit{}
	kit.Product.ID = p.ID
	kit.Product.Title = p.Title
	kit.Product.Emoji = p.Emoji
	kit.Product.Status = p.Status
	kit.Product.PriceCents = p.PriceCents
	kit.Product.CostCents = p.CostCents
	kit.Product.CostSource = p.CostSource
	kit.Product.MarginPct = p.MarginPct
	kit.Product.Note = p.Note
	if p.CoverURL != nil {
		kit.Product.CoverURL = strings.TrimSpace(*p.CoverURL)
	}

	// 该商品已出片的成片(可下载),新→旧。
	var vids []model.Video
	s.db.WithContext(ctx).
		Where("workspace_id = ? AND product_id = ? AND processing = ?", wsID, pid, model.VideoCompleted).
		Order("created_at DESC").Find(&vids)
	for _, v := range vids {
		kit.Videos = append(kit.Videos, PublishKitVideo{
			ID: v.ID, Title: v.Title, VideoURL: v.VideoURL, ThumbnailURL: v.ThumbnailURL,
		})
	}

	// 该商品最近一条 Listing —— LISTING 任务把 productId 存在 metadata 里。
	var lt model.AgentTask
	if e := s.db.WithContext(ctx).
		Where("workspace_id = ? AND agent = ? AND status = ? AND metadata->>'productId' = ?",
			wsID, model.AgentListing, model.TaskDone, pid.String()).
		Order("created_at DESC").First(&lt).Error; e == nil && len(lt.Metadata) > 0 {
		var m struct {
			Title         string            `json:"title"`
			SellingPoints []string          `json:"sellingPoints"`
			Hashtags      []string          `json:"hashtags"`
			AplusSections []PublishKitAplus `json:"aplusSections"`
			Images        []string          `json:"images"`
			ImagePrompts  []string          `json:"imagePrompts"`
			ImagesStatus  string            `json:"imagesStatus"`
		}
		if json.Unmarshal(lt.Metadata, &m) == nil && m.Title != "" {
			kit.Listing = &PublishKitListing{
				TaskID: lt.ID, Title: m.Title, SellingPoints: m.SellingPoints, Hashtags: m.Hashtags,
				AplusSections: m.AplusSections, Images: m.Images,
				ImagePrompts: m.ImagePrompts, ImagesStatus: m.ImagesStatus,
			}
		}
	}
	return kit, nil
}
