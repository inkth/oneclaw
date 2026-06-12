// Package errors 定义统一的错误码与错误响应体。
//
// 错误码字符串机器可读;HTTP 状态码自动派生;前端按 code 分支处理。
package errors

import (
	"errors"
	"fmt"
	"net/http"
)

type Code string

const (
	CodeInternal           Code = "INTERNAL_ERROR"
	CodeBadRequest         Code = "BAD_REQUEST"
	CodeUnauthorized       Code = "UNAUTHORIZED"
	CodeForbidden          Code = "FORBIDDEN"
	CodeNotFound           Code = "NOT_FOUND"
	CodeConflict           Code = "CONFLICT"
	CodeTooManyRequest     Code = "TOO_MANY_REQUEST"
	CodeServiceUnavailable Code = "SERVICE_UNAVAILABLE"

	// 认证相关
	CodeAuthRequired   Code = "AUTH_REQUIRED"
	CodeInvalidToken   Code = "INVALID_TOKEN"
	CodeInvalidSMSCode Code = "INVALID_SMS_CODE"
	CodeSMSRateLimited Code = "SMS_RATE_LIMITED"

	// 业务
	CodeUpstream      Code = "UPSTREAM_ERROR"  // EchoTik 等上游错误
	CodeQuotaExceeded Code = "QUOTA_EXCEEDED" // 本月配额用尽,前端引导升级
)

type AppError struct {
	Code       Code
	Message    string
	Details    string
	HTTPStatus int
	Err        error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error { return e.Err }

// Response 统一错误响应体(jifou 风格)。业务成功响应见 handler.OK / handler.Fail。
type Response struct {
	Code      Code   `json:"code"`
	Message   string `json:"message"`
	Details   string `json:"details,omitempty"`
	RequestID string `json:"request_id,omitempty"`
}

func New(code Code, msg string) *AppError {
	return &AppError{Code: code, Message: msg, HTTPStatus: httpStatusFor(code)}
}

func Wrap(code Code, msg string, err error) *AppError {
	return &AppError{Code: code, Message: msg, Err: err, HTTPStatus: httpStatusFor(code)}
}

func BadRequest(msg string) *AppError          { return New(CodeBadRequest, msg) }
func Unauthorized(msg string) *AppError        { return New(CodeUnauthorized, msg) }
func Forbidden(msg string) *AppError           { return New(CodeForbidden, msg) }
func NotFound(msg string) *AppError            { return New(CodeNotFound, msg) }
func Conflict(msg string) *AppError            { return New(CodeConflict, msg) }
func Internal(msg string, err error) *AppError { return Wrap(CodeInternal, msg, err) }

func As(err error) (*AppError, bool) {
	var ae *AppError
	if errors.As(err, &ae) {
		return ae, true
	}
	return nil, false
}

func httpStatusFor(code Code) int {
	switch code {
	case CodeBadRequest, CodeInvalidSMSCode:
		return http.StatusBadRequest
	case CodeUnauthorized, CodeAuthRequired, CodeInvalidToken:
		return http.StatusUnauthorized
	case CodeForbidden:
		return http.StatusForbidden
	case CodeNotFound:
		return http.StatusNotFound
	case CodeConflict:
		return http.StatusConflict
	case CodeTooManyRequest, CodeSMSRateLimited:
		return http.StatusTooManyRequests
	case CodeServiceUnavailable:
		return http.StatusServiceUnavailable
	case CodeQuotaExceeded:
		return http.StatusPaymentRequired
	case CodeUpstream:
		return http.StatusBadGateway
	default:
		return http.StatusInternalServerError
	}
}
