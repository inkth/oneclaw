package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

// productBatchMax 单批最多处理的商品图数(控成本/出图并发;超出引导用户分批)。
const productBatchMax = 12

// productShotCount 每个商品出几张展示图(各品类镜头组都保持这个数,前端积分预估也按它)。
const productShotCount = 4

// productMaxRefs 一个商品最多用几张原图作出图参考(同款多角度);过多反而干扰模型。
const productMaxRefs = 4

// defaultProductTitle 自建商品的占位标题;生成 Listing 后回填成 Listing 标题(仍是此值才覆盖,不动用户改过的)。
const defaultProductTitle = "我的商品"

// productShotSets 各品类的「商品展示图」精选镜头组(每组 4 张):纯模板 + fal Seedream edit
// (以用户原图为参考锚定真货),listingImage 会自动加「the exact same product…」前缀与
// e-commerce 后缀,这里只描述构图。品类由 Gemini 看图判定(classifyProduct),判不出/失败回落 "other"。
var productShotSets = map[string][]string{
	"apparel": { // 服饰/鞋包
		"neatly hung on a wooden hanger against a clean light-grey studio wall, full item visible",
		"laid flat (flat-lay) neatly arranged on a soft neutral fabric surface, top-down",
		"extreme close-up macro of the fabric texture and stitching detail, sharp focus",
		"styled in a tasteful lifestyle scene with matching props and soft natural light",
	},
	"beauty": { // 美妆个护
		"on a pure white seamless background, centered, clean studio softbox lighting, catalog main image",
		"close-up macro showing the product texture/swatch and finish, sharp focus",
		"placed on a styled vanity counter scene with soft natural light",
		"tight detail of the label, cap and key features, crisp focus",
	},
	"electronics": { // 3C 数码/配件
		"on a pure white seamless background, centered, clean studio lighting, catalog main image",
		"in a real-life use scene (desk/home) showing it in context, shallow depth of field",
		"close-up detail of ports, buttons and material finish, sharp focus",
		"top-down flat-lay of the product with its accessories neatly arranged",
	},
	"home": { // 家居家品
		"on a pure white seamless background, centered, clean studio lighting, catalog main image",
		"placed in a cozy real-life home interior scene, natural window light",
		"close-up macro of the material, texture and craftsmanship, sharp focus",
		"top-down flat-lay on a clean neutral surface, neat styled composition",
	},
	"food": { // 食品
		"product packaging on a pure white seamless background, centered, clean studio lighting",
		"plated and served in an appetizing lifestyle scene on a table, natural light",
		"extreme close-up of the food texture and detail, mouth-watering, sharp focus",
		"top-down flat-lay with simple props and ingredients neatly arranged",
	},
	"jewelry": { // 饰品/手表
		"on a clean white background with soft reflections, centered, crisp studio lighting, catalog main image",
		"extreme macro close-up showing fine detail, gemstones and craftsmanship, sharp focus",
		"presented in an elegant gift box with soft lighting",
		"worn/displayed with a simple reference for scale, clean composition",
	},
	"toys": { // 玩具
		"on a pure white seamless background, centered, clean studio lighting, catalog main image",
		"in a playful real-life scene showing the toy in use, bright soft light",
		"close-up detail of the material, parts and finish, sharp focus",
		"top-down flat-lay with any accessories neatly arranged",
	},
	"other": { // 通用兜底(原固定 4 张)
		"on a pure white seamless background, centered composition, professional studio softbox lighting, crisp catalog main image",
		"placed in a tasteful real-life lifestyle scene that suits the product, natural window light, shallow depth of field, lifestyle shot",
		"extreme close-up macro shot emphasizing material, texture and craftsmanship details, sharp focus",
		"top-down flat-lay from directly above on a clean neutral surface, neat styled composition",
	},
}

// shotClassifySystem 让 Gemini 看图只回一个品类词(输出极短、好解析、好兜底)。
const shotClassifySystem = `你是电商商品图像分类器。看图,从下列英文类别里挑最贴切的一个,只输出这一个词,不要任何解释、引号或标点:
apparel beauty electronics home food jewelry toys other`

// classifyProduct 用 Gemini 看图判商品品类;任何失败(未配置/报错/空/不在枚举内)都回 "other"(兜底)。
// 走 ReviewModel(gemini 经代理),输出只一个词,maxTokens 很小;失败不影响出图(回落通用镜头组)。
func (s *AgentService) classifyProduct(ctx context.Context, photoURL string) string {
	if !s.llm.Configured() || photoURL == "" {
		return "other"
	}
	cctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	res, err := s.llm.ChatVision(cctx, s.llm.ReviewModel(), shotClassifySystem, "判断这张商品图的品类。", []string{photoURL}, false, 16)
	if err != nil || res == nil {
		return "other"
	}
	out := strings.ToLower(res.Content)
	for cat := range productShotSets {
		if cat != "other" && strings.Contains(out, cat) {
			return cat
		}
	}
	return "other"
}

// shotSetFor 选该商品的镜头组:Gemini 判品类命中则用对应组,否则通用兜底组。
func (s *AgentService) shotSetFor(ctx context.Context, photoURL string) []string {
	if set, ok := productShotSets[s.classifyProduct(ctx, photoURL)]; ok {
		return set
	}
	return productShotSets["other"]
}

// ProductBatchItem 批量里单张图的产出:一张自建商品卡(出图中)。
type ProductBatchItem struct {
	MaterialID uuid.UUID `json:"materialId"`
	ProductID  uuid.UUID `json:"productId"`
	Title      string    `json:"title"`
}

// ProductBatchResult 批量结果:前端据此跳到「我的商品」并轮询各卡出图进度。
type ProductBatchResult struct {
	BatchID uuid.UUID          `json:"batchId"`
	Items   []ProductBatchItem `json:"items"`
}

// CreateProductBatch 批量「把我拍的商品图变成商品」:每个 group(一组同款多角度的图)→ 建一张
// 自建商品卡(DiscoverProductID 为空,SourceImages 存这组原图)→ 据这组图多参考出 N 张展示图
// (白底/场景/细节/俯拍,fal edit,不调 LLM)。「各做1个」= 每组一张图;「合并为1个」= 一组多张。
func (s *AgentService) CreateProductBatch(ctx context.Context, wsID uuid.UUID, groups [][]uuid.UUID) (*ProductBatchResult, error) {
	if !s.fal.Configured() || !s.storage.Configured() {
		return nil, apperr.BadRequest("出图服务未配置(需要 FALAI_API_KEY 与 COS)")
	}
	// 整理分组:组内去重、解析为有效图片 URL、参考图封顶;丢掉空组。
	type grp struct {
		ids  []uuid.UUID
		urls []string
	}
	var prepared []grp
	for _, g := range groups {
		seen := map[uuid.UUID]bool{}
		var ids []uuid.UUID
		var urls []string
		for _, id := range g {
			if id == uuid.Nil || seen[id] {
				continue
			}
			seen[id] = true
			if u := s.materialImageURL(ctx, wsID, id); u != "" {
				ids = append(ids, id)
				urls = append(urls, u)
			}
		}
		if len(urls) == 0 {
			continue
		}
		if len(urls) > productMaxRefs {
			urls = urls[:productMaxRefs]
			ids = ids[:productMaxRefs]
		}
		prepared = append(prepared, grp{ids: ids, urls: urls})
	}
	if len(prepared) == 0 {
		return nil, apperr.BadRequest("请至少选择一张商品图")
	}
	if len(prepared) > productBatchMax {
		return nil, apperr.BadRequest(fmt.Sprintf("单批最多 %d 个商品,请分批处理", productBatchMax))
	}

	// 整批前置校验出图额度(每个商品 productShotCount 张图):不够整批拒,一个不建。
	need := model.CreditsFor(model.UsageImage, len(prepared)*productShotCount)
	if err := s.quota.EnsureBudget(ctx, wsID, need); err != nil {
		return nil, err
	}

	res := &ProductBatchResult{BatchID: uuid.New()}
	for _, g := range prepared {
		emoji := "🛍️"
		cover := g.urls[0]
		srcB, _ := json.Marshal(g.urls)
		prod := model.Product{
			WorkspaceID:  wsID,
			Title:        defaultProductTitle, // 占位;生成 Listing 后回填成 Listing 标题
			Category:     "我的商品",
			Emoji:        &emoji,
			CostSource:   model.CostSourceEstimate,
			Status:       model.ProductEvaluating,
			CoverURL:     &cover, // 出图前先用原图占位,卡片即刻有图;出好后封面换成白底图。
			SourceImages: model.JSONB(srcB),
			ImagesStatus: listingImagesRunning,
		}
		if err := s.db.WithContext(ctx).Create(&prod).Error; err != nil {
			logger.Warn("[agent] 批量建商品失败,跳过该组", logger.Err(err))
			continue
		}
		pid := prod.ID
		// 出图额度逐商品扣(refID=商品):中途耗尽则该商品标失败并停,返回已建部分。
		if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageImage, productShotCount, &pid); err != nil {
			s.db.WithContext(ctx).Model(&model.Product{}).Where("id = ?", pid).
				Update("images_status", listingImagesFailed)
			logger.Warn("[agent] 批量做商品额度耗尽,中止", logger.Err(err))
			break
		}
		go s.runProductImages(pid, wsID, g.urls)
		res.Items = append(res.Items, ProductBatchItem{MaterialID: g.ids[0], ProductID: pid, Title: prod.Title})
	}
	if len(res.Items) == 0 {
		return nil, apperr.BadRequest("没有可处理的商品图,请确认已上传图片素材")
	}
	return res, nil
}

// RetryProductImages 重跑自建商品的展示图(images_status=FAILED 的重试入口):
// 原子认领 FAILED→RUNNING 防双击,重占一笔出图额度(失败时已退回)后按原图重出,
// 成功/失败回写与退款复用 runProductImages 的口径。
func (s *AgentService) RetryProductImages(ctx context.Context, wsID, productID uuid.UUID) error {
	if !s.fal.Configured() || !s.storage.Configured() {
		return apperr.BadRequest("出图服务未配置(需要 FALAI_API_KEY 与 COS)")
	}
	var p model.Product
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", productID, wsID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return apperr.NotFound("商品不存在")
	}
	if err != nil {
		return apperr.Wrap(apperr.CodeInternal, "查询商品失败", err)
	}
	var urls []string
	if len(p.SourceImages) > 0 {
		_ = json.Unmarshal(p.SourceImages, &urls)
	}
	if len(urls) == 0 {
		return apperr.BadRequest("该商品没有原图,无法重出展示图")
	}
	// 原子认领:FAILED → RUNNING,并发/双击时只有一个请求生效。
	claim := s.db.WithContext(ctx).Model(&model.Product{}).
		Where("id = ? AND workspace_id = ? AND images_status = ?", productID, wsID, listingImagesFailed).
		Update("images_status", listingImagesRunning)
	if claim.Error != nil {
		return apperr.Wrap(apperr.CodeInternal, "重试失败", claim.Error)
	}
	if claim.RowsAffected == 0 {
		return apperr.BadRequest("该商品没有待重试的出图任务")
	}
	// 出图失败时额度已退回,这里重占一笔(refID=商品,与首次同口径);超额把认领还回 FAILED。
	if err := s.quota.CheckAndRecord(ctx, wsID, model.UsageImage, productShotCount, &productID); err != nil {
		s.db.WithContext(ctx).Model(&model.Product{}).Where("id = ?", productID).
			Update("images_status", listingImagesFailed)
		return err
	}
	go s.runProductImages(productID, wsID, urls)
	return nil
}

// runProductImages 后台据原图并发出 N 张展示图 → 写 Product.Images + 封面(白底图)+ ImagesStatus。
// 部分失败不拖垮:有图即 DONE;全军覆没 FAILED 并退回出图额度(部分成功不退,成本已花)。
func (s *AgentService) runProductImages(productID, wsID uuid.UUID, photoURLs []string) {
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()

	ref0 := ""
	if len(photoURLs) > 0 {
		ref0 = photoURLs[0]
	}
	// Gemini 看(首张)图判品类 → 该品类精选镜头组;判不出/失败回落通用 4 张(不阻断出图)。
	shots := s.shotSetFor(ctx, ref0)
	urls := make([]string, len(shots))
	var wg sync.WaitGroup
	for i, prompt := range shots {
		wg.Add(1)
		go func(i int, prompt string) {
			defer wg.Done()
			// 多角度原图一起作参考(同款多图合并时),出图更保真一致。
			u, err := s.listingImage(ctx, productID, i, prompt, photoURLs)
			if err != nil {
				logger.Warn("[agent] 商品展示图生成失败",
					logger.String("product", productID.String()), logger.Err(err))
				return
			}
			urls[i] = u
		}(i, prompt)
	}
	wg.Wait()

	var done []string
	for _, u := range urls {
		if u != "" {
			done = append(done, u)
		}
	}

	wctx, wcancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer wcancel()
	if len(done) == 0 {
		s.db.WithContext(wctx).Model(&model.Product{}).
			Where("id = ? AND workspace_id = ?", productID, wsID).
			Update("images_status", listingImagesFailed)
		rctx, rcancel := context.WithTimeout(context.Background(), 10*time.Second)
		s.quota.Refund(rctx, productID, model.UsageImage)
		rcancel()
		return
	}
	b, _ := json.Marshal(done)
	// 出好图:写全部展示图 + 封面换成第一张(白底图)+ 标 DONE。
	s.db.WithContext(wctx).Model(&model.Product{}).
		Where("id = ? AND workspace_id = ?", productID, wsID).
		Updates(map[string]any{
			"images":        model.JSONB(b),
			"cover_url":     done[0],
			"images_status": listingImagesDone,
		})
}
