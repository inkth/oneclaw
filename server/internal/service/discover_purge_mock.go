package service

import (
	"context"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

// mockIDLike 是 mock 数据外部 ID 的统一前缀:mock.go / mock_entities.go 里的
// 商品/店铺/达人/视频占位数据 external_id 全部以 "mock-" 开头。
const mockIDLike = "mock-%"

// PurgeMockReport 汇报各表清掉的 mock 行数。
type PurgeMockReport struct {
	Products             int64
	ProductSnapshots     int64
	Interactions         int64
	ImportedCandidates   int64
	Sellers              int64
	Influencers          int64
	Videos               int64
	RanklistEntriesFixed int64 // external_ids 里剔除过 mock id 的榜单顺序记录数
}

// total 本轮实际清到的行数合计(用于判断是否需要发声)。
func (r PurgeMockReport) total() int64 {
	return r.Products + r.ProductSnapshots + r.Interactions + r.ImportedCandidates +
		r.Sellers + r.Influencers + r.Videos + r.RanklistEntriesFixed
}

// PurgeMockData 删除库里遗留的 mock 占位数据。历史上生产 EchoTik 短暂不可用时,
// 错误兜底会把 mock 榜落进 discover_products(现已改为返回空态,不再产生),此命令清理存量。
// 幂等:再次运行只会清到 0。
func (s *DiscoverService) PurgeMockData(ctx context.Context) (PurgeMockReport, error) {
	var rep PurgeMockReport

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 1. 收集所有 mock 商品 id(供清理其快照、收藏、导入候选的外键引用)。
		var mockProductIDs []uuid.UUID
		if err := tx.Model(&model.DiscoverProduct{}).
			Where("external_id LIKE ?", mockIDLike).
			Pluck("id", &mockProductIDs).Error; err != nil {
			return err
		}

		if len(mockProductIDs) > 0 {
			r := tx.Where("discover_product_id IN ?", mockProductIDs).Delete(&model.DiscoverSnapshot{})
			if r.Error != nil {
				return r.Error
			}
			rep.ProductSnapshots = r.RowsAffected

			r = tx.Where("discover_product_id IN ?", mockProductIDs).Delete(&model.WorkspaceDiscoverInteraction{})
			if r.Error != nil {
				return r.Error
			}
			rep.Interactions = r.RowsAffected

			// 用户若把 mock 商品导入了工作台(选品候选),一并删除——它是假货,没有留存价值。
			r = tx.Where("discover_product_id IN ?", mockProductIDs).Delete(&model.Product{})
			if r.Error != nil {
				return r.Error
			}
			rep.ImportedCandidates = r.RowsAffected
		}

		// 2. 删商品本体。
		r := tx.Where("external_id LIKE ?", mockIDLike).Delete(&model.DiscoverProduct{})
		if r.Error != nil {
			return r.Error
		}
		rep.Products = r.RowsAffected

		// 3. 店铺/达人/视频实体(mock 实体从不落库,但防御式清理,幂等)。
		r = tx.Where("external_id LIKE ?", mockIDLike).Delete(&model.DiscoverSeller{})
		if r.Error != nil {
			return r.Error
		}
		rep.Sellers = r.RowsAffected

		r = tx.Where("external_id LIKE ?", mockIDLike).Delete(&model.DiscoverInfluencer{})
		if r.Error != nil {
			return r.Error
		}
		rep.Influencers = r.RowsAffected

		r = tx.Where("external_id LIKE ?", mockIDLike).Delete(&model.DiscoverVideo{})
		if r.Error != nil {
			return r.Error
		}
		rep.Videos = r.RowsAffected

		// 4. 榜单顺序记录:external_ids 里可能夹带 mock id(理论上只有 live 才写,防御式剔除)。
		fixed, err := purgeMockFromRanklistEntries(tx)
		if err != nil {
			return err
		}
		rep.RanklistEntriesFixed = fixed

		return nil
	})
	if err != nil {
		return PurgeMockReport{}, err
	}

	// 每次启动都会自愈调用,清干净后应安静:有清到东西才 Info,否则 Debug。
	fields := []zap.Field{
		logger.Int64("products", rep.Products),
		logger.Int64("productSnapshots", rep.ProductSnapshots),
		logger.Int64("interactions", rep.Interactions),
		logger.Int64("importedCandidates", rep.ImportedCandidates),
		logger.Int64("sellers", rep.Sellers),
		logger.Int64("influencers", rep.Influencers),
		logger.Int64("videos", rep.Videos),
		logger.Int64("ranklistEntriesFixed", rep.RanklistEntriesFixed),
	}
	if rep.total() > 0 {
		logger.Info("[purge-mock] 清理完成", fields...)
	} else {
		logger.Debug("[purge-mock] 无遗留 mock 数据", fields...)
	}
	return rep, nil
}

// purgeMockFromRanklistEntries 扫描商品榜(RanklistCacheEntry)与实体榜(EntityRanklistEntry)
// 的 external_ids,剔除以 "mock-" 开头的 id;若整条记录被清空则删除该记录。
func purgeMockFromRanklistEntries(tx *gorm.DB) (int64, error) {
	var fixed int64

	var cacheEntries []model.RanklistCacheEntry
	if err := tx.Find(&cacheEntries).Error; err != nil {
		return 0, err
	}
	for i := range cacheEntries {
		e := &cacheEntries[i]
		kept, changed := stripMockIDs(e.ExternalIDs)
		if !changed {
			continue
		}
		fixed++
		if len(kept) == 0 {
			if err := tx.Delete(e).Error; err != nil {
				return 0, err
			}
			continue
		}
		e.ExternalIDs = kept
		if err := tx.Save(e).Error; err != nil { // 走结构体保存,external_ids 的 json serializer 才生效
			return 0, err
		}
	}

	var entityEntries []model.EntityRanklistEntry
	if err := tx.Find(&entityEntries).Error; err != nil {
		return 0, err
	}
	for i := range entityEntries {
		e := &entityEntries[i]
		kept, changed := stripMockIDs(e.ExternalIDs)
		if !changed {
			continue
		}
		fixed++
		if len(kept) == 0 {
			if err := tx.Delete(e).Error; err != nil {
				return 0, err
			}
			continue
		}
		e.ExternalIDs = kept
		if err := tx.Save(e).Error; err != nil {
			return 0, err
		}
	}

	return fixed, nil
}

// stripMockIDs 返回剔除 mock 前缀 id 后的切片,以及是否有变化。
func stripMockIDs(ids []string) (kept []string, changed bool) {
	kept = make([]string, 0, len(ids))
	for _, id := range ids {
		if len(id) >= 5 && id[:5] == "mock-" {
			changed = true
			continue
		}
		kept = append(kept, id)
	}
	return kept, changed
}
