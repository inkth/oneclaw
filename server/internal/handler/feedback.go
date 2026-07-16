package handler

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperr "github.com/faxianmao/server/internal/errors"
	"github.com/faxianmao/server/internal/middleware"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service"
)

// FeedbackHandler 站内用户反馈:提交(需登录)+ 管理端列表。
type FeedbackHandler struct {
	fb *service.FeedbackService
}

func NewFeedbackHandler(fb *service.FeedbackService) *FeedbackHandler {
	return &FeedbackHandler{fb: fb}
}

const feedbackMaxLen = 2000

type createFeedbackReq struct {
	Type        string  `json:"type" binding:"required,oneof=issue idea"`
	Content     string  `json:"content" binding:"required"`
	Pathname    string  `json:"pathname"`
	WorkspaceID *string `json:"workspaceId"`
}

func (h *FeedbackHandler) Create(c *gin.Context) {
	uid, ok := middleware.UserID(c)
	if !ok {
		_ = c.Error(apperr.New(apperr.CodeAuthRequired, "未登录"))
		return
	}
	var in createFeedbackReq
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(apperr.BadRequest("参数缺失:需要 type(issue|idea) 和 content"))
		return
	}
	content := strings.TrimSpace(in.Content)
	if content == "" {
		_ = c.Error(apperr.BadRequest("反馈内容不能为空"))
		return
	}
	if len([]rune(content)) > feedbackMaxLen {
		_ = c.Error(apperr.BadRequest("反馈内容过长(上限 2000 字)"))
		return
	}
	f := model.Feedback{
		UserID:   uid,
		Type:     in.Type,
		Content:  content,
		Pathname: truncateRunes(strings.TrimSpace(in.Pathname), 200),
	}
	if in.WorkspaceID != nil {
		if wid, err := uuid.Parse(*in.WorkspaceID); err == nil {
			f.WorkspaceID = &wid
		}
	}
	created, err := h.fb.Create(c.Request.Context(), f)
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"id": created.ID})
}

// AdminList GET /admin/feedback?type=&page= 反馈分页(仅 admin,路由层已拦)。
func (h *FeedbackHandler) AdminList(c *gin.Context) {
	rows, total, page, err := h.fb.AdminList(c.Request.Context(), c.Query("type"), pageParam(c))
	if err != nil {
		_ = c.Error(err)
		return
	}
	OK(c, gin.H{"rows": rows, "total": total, "page": page, "pageSize": 20})
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
