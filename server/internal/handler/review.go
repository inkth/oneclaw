package handler

import (
	"fmt"
	"io"
	"strconv"

	"github.com/gin-gonic/gin"

	apperr "github.com/oneclaw/server/internal/errors"
	"github.com/oneclaw/server/internal/logger"
	"github.com/oneclaw/server/internal/service"
	"github.com/oneclaw/server/internal/service/review"
)

const maxReviewBytes = 15 << 20 // 15MB

// ReviewHandler 复盘(GMVMax 数据诊断):接收上传报表 → 解析 → 四象限诊断。
// 计算同步完成后经 AgentService 落库为 REVIEW 任务,与其他 Agent 统一留痕。
type ReviewHandler struct {
	ws     *service.WorkspaceService
	agents *service.AgentService
}

func NewReviewHandler(ws *service.WorkspaceService, agents *service.AgentService) *ReviewHandler {
	return &ReviewHandler{ws: ws, agents: agents}
}

func (h *ReviewHandler) Analyze(c *gin.Context) {
	_, wid, ok := authorizeWorkspace(c, h.ws)
	if !ok {
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		_ = c.Error(apperr.BadRequest("缺少报表文件"))
		return
	}
	if fileHeader.Size > maxReviewBytes {
		_ = c.Error(apperr.BadRequest("文件超过 15MB 上限"))
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		_ = c.Error(apperr.BadRequest("文件读取失败"))
		return
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		_ = c.Error(apperr.BadRequest("文件读取失败"))
		return
	}

	var targetRoi float64
	if v, perr := strconv.ParseFloat(c.PostForm("targetRoi"), 64); perr == nil && v > 0 {
		targetRoi = v
	}

	parsed, err := review.ParseReport(data, fileHeader.Filename)
	if err != nil {
		_ = c.Error(apperr.BadRequest("解析报表失败:" + err.Error()))
		return
	}
	if len(parsed.Rows) == 0 {
		msg := "未解析到有效数据,请检查报表格式"
		if len(parsed.Warnings) > 0 {
			msg = parsed.Warnings[0]
		}
		_ = c.Error(apperr.BadRequest(msg))
		return
	}

	result := review.Analyze(parsed.Rows, targetRoi, parsed.Warnings)

	// 落库为 REVIEW 任务统一留痕;失败不影响本次返回结果。
	input := fmt.Sprintf("复盘报表「%s」· ROI 目标 %.1f", fileHeader.Filename, result.Baseline.TargetRoi)
	task, rerr := h.agents.RecordReview(c.Request.Context(), wid, input, &result)
	if rerr != nil {
		logger.Warn("[review] 落库失败", logger.String("err", rerr.Error()))
	}
	OK(c, gin.H{"result": result, "task": task})
}
