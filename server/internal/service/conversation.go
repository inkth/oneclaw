package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
)

// conversationTitle 从首句派活指令提炼会话标题(rune 安全,最多 40 字)。空指令兜底「新对话」。
func conversationTitle(input string) string {
	s := strings.TrimSpace(strings.Join(strings.Fields(input), " "))
	if s == "" {
		return "新对话"
	}
	r := []rune(s)
	if len(r) > 40 {
		return string(r[:40]) + "…"
	}
	return s
}

// ensureConversation 解析或新建会话:
//   - convID 命中本工作区:复用,并把活跃时间/最近 Agent 刷新到当前(让它在列表置顶)。
//   - convID 为空 / 不存在 / 越权:按首句 input 新建一条(脏 ID 静默落回新建,不卡住派活)。
//
// 返回会话 ID,调用方据此给任务挂 conversation_id。
func (s *AgentService) ensureConversation(ctx context.Context, wsID uuid.UUID, convID *uuid.UUID, input, agent string) (uuid.UUID, error) {
	db := s.db.WithContext(ctx)
	if convID != nil && *convID != uuid.Nil {
		var c model.Conversation
		if err := db.Where("id = ? AND workspace_id = ?", *convID, wsID).First(&c).Error; err == nil {
			db.Model(&model.Conversation{}).Where("id = ?", c.ID).
				Updates(map[string]any{"updated_at": time.Now(), "last_agent": agent})
			return c.ID, nil
		}
	}
	c := model.Conversation{WorkspaceID: wsID, Title: conversationTitle(input), LastAgent: agent}
	if err := db.Create(&c).Error; err != nil {
		return uuid.Nil, err
	}
	return c.ID, nil
}

// touchConversation 在已知会话上刷新活跃时间与最近 Agent(接力/复盘等已自建会话后调用)。
func (s *AgentService) touchConversation(ctx context.Context, convID uuid.UUID, agent string) {
	s.db.WithContext(ctx).Model(&model.Conversation{}).Where("id = ?", convID).
		Updates(map[string]any{"updated_at": time.Now(), "last_agent": agent})
}

// ListConversations 工作区的会话列表,按最后活跃倒序(最多 100 条)。
func (s *AgentService) ListConversations(ctx context.Context, wsID uuid.UUID) ([]model.Conversation, error) {
	var items []model.Conversation
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ?", wsID).
		Order("updated_at DESC").
		Limit(100).
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询会话失败", err)
	}
	return items, nil
}

// getConversation 校验会话归属本工作区,返回之;不存在/越权统一 404。
func (s *AgentService) getConversation(ctx context.Context, wsID, convID uuid.UUID) (*model.Conversation, error) {
	var c model.Conversation
	err := s.db.WithContext(ctx).Where("id = ? AND workspace_id = ?", convID, wsID).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.NotFound("会话不存在")
	}
	if err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询会话失败", err)
	}
	return &c, nil
}

// ListConversationTasks 某会话下的任务流(新→旧,与工作区级 List 同口径,前端按时间正序渲染)。
func (s *AgentService) ListConversationTasks(ctx context.Context, wsID, convID uuid.UUID) ([]model.AgentTask, error) {
	if _, err := s.getConversation(ctx, wsID, convID); err != nil {
		return nil, err
	}
	var items []model.AgentTask
	if err := s.db.WithContext(ctx).
		Where("conversation_id = ?", convID).
		Order("created_at DESC").
		Find(&items).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "查询任务失败", err)
	}
	return items, nil
}

// RenameConversation 重命名会话(标题 rune 安全裁剪,空标题拒绝)。
func (s *AgentService) RenameConversation(ctx context.Context, wsID, convID uuid.UUID, title string) (*model.Conversation, error) {
	c, err := s.getConversation(ctx, wsID, convID)
	if err != nil {
		return nil, err
	}
	t := strings.TrimSpace(strings.Join(strings.Fields(title), " "))
	if t == "" {
		return nil, apperr.BadRequest("标题不能为空")
	}
	if r := []rune(t); len(r) > 60 {
		t = string(r[:60])
	}
	if err := s.db.WithContext(ctx).Model(&model.Conversation{}).Where("id = ?", c.ID).
		Update("title", t).Error; err != nil {
		return nil, apperr.Wrap(apperr.CodeInternal, "重命名失败", err)
	}
	c.Title = t
	return c, nil
}

// DeleteConversation 删除会话及其对话记录(同事务)。
// 已生成的视频/选品等产物挂在各自库里,不受影响;不退积分(终态任务额度早已结算)。
func (s *AgentService) DeleteConversation(ctx context.Context, wsID, convID uuid.UUID) error {
	if _, err := s.getConversation(ctx, wsID, convID); err != nil {
		return err
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("conversation_id = ?", convID).Delete(&model.AgentTask{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND workspace_id = ?", convID, wsID).Delete(&model.Conversation{}).Error
	})
	if err != nil {
		return apperr.Wrap(apperr.CodeInternal, "删除会话失败", err)
	}
	return nil
}

// BackfillConversations 启动时一次性回填:给历史上没有归属会话的任务各建一条会话(一任务一会话),
// 标题取任务首句、时间沿用任务时间。幂等 —— 只处理 conversation_id 为空的行,已回填过即空跑。
func (s *AgentService) BackfillConversations(ctx context.Context) {
	var orphans []model.AgentTask
	if err := s.db.WithContext(ctx).
		Where("conversation_id IS NULL").
		Order("created_at ASC").
		Find(&orphans).Error; err != nil {
		logger.Warn("[agent] 会话回填:查询历史任务失败", logger.Err(err))
		return
	}
	if len(orphans) == 0 {
		return
	}
	done := 0
	for _, t := range orphans {
		c := model.Conversation{
			ID:          uuid.New(),
			WorkspaceID: t.WorkspaceID,
			Title:       conversationTitle(t.Input),
			LastAgent:   t.Agent,
			CreatedAt:   t.CreatedAt,
			UpdatedAt:   t.CreatedAt,
		}
		if err := s.db.WithContext(ctx).Create(&c).Error; err != nil {
			logger.Warn("[agent] 会话回填:建会话失败", logger.Err(err))
			continue
		}
		if err := s.db.WithContext(ctx).Model(&model.AgentTask{}).Where("id = ?", t.ID).
			Update("conversation_id", c.ID).Error; err != nil {
			logger.Warn("[agent] 会话回填:回写任务失败", logger.Err(err))
			continue
		}
		done++
	}
	logger.Info("[agent] 会话回填完成", logger.Int("count", done))
}
