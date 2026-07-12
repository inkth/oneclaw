package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common"
	terrors "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/errors"
	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/profile"
	sms "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/sms/v20210111"

	"github.com/faxianmao/server/internal/config"
	"github.com/faxianmao/server/internal/logger"
)

const (
	tencentSmsEndpoint   = "sms.tencentcloudapi.com"
	tencentSmsTimeoutSec = 5
	// 模板占位:{1}=验证码 {2}=有效分钟数;与 smsCodeTTL(5min)一致。
	smsExpireMinutes = 5
)

// TencentSender 通过腾讯云短信 v20210111 下发验证码(移植自 deepclaw)。
// 模板需含两个占位符:{1}=验证码,{2}=有效分钟数。日志绝不记录 code。
type TencentSender struct {
	cfg *config.SMSConfig
}

func (s TencentSender) Send(_ context.Context, phone, code string) error {
	cred := common.NewCredential(s.cfg.TencentSecretID, s.cfg.TencentSecretKey)
	cpf := profile.NewClientProfile()
	cpf.HttpProfile.Endpoint = tencentSmsEndpoint
	cpf.HttpProfile.ReqTimeout = tencentSmsTimeoutSec

	client, err := sms.NewClient(cred, s.cfg.TencentRegion, cpf)
	if err != nil {
		return fmt.Errorf("tencent sms client init: %w", err)
	}

	req := sms.NewSendSmsRequest()
	req.SmsSdkAppId = common.StringPtr(s.cfg.TencentSDKAppID)
	req.SignName = common.StringPtr(s.cfg.TencentSignName)
	req.TemplateId = common.StringPtr(s.cfg.TencentTemplateID)
	req.TemplateParamSet = common.StringPtrs([]string{code, strconv.Itoa(smsExpireMinutes)})
	req.PhoneNumberSet = common.StringPtrs([]string{e164(phone)})

	resp, err := client.SendSms(req)
	if err != nil {
		if sdkErr, ok := err.(*terrors.TencentCloudSDKError); ok {
			logger.Error("tencent sms api error",
				logger.String("phone", phone),
				logger.String("code", sdkErr.GetCode()),
				logger.String("message", sdkErr.GetMessage()),
				logger.String("request_id", sdkErr.GetRequestId()))
			return fmt.Errorf("tencent sms api error: %s - %s", sdkErr.GetCode(), sdkErr.GetMessage())
		}
		return fmt.Errorf("tencent sms send: %w", err)
	}
	if resp == nil || resp.Response == nil {
		return fmt.Errorf("tencent sms send: empty response")
	}

	requestID := ""
	if resp.Response.RequestId != nil {
		requestID = *resp.Response.RequestId
	}
	// 接口 200 不代表每条成功,逐条查 SendStatusSet。
	for _, st := range resp.Response.SendStatusSet {
		if st == nil || st.Code == nil {
			continue
		}
		if *st.Code != "Ok" {
			msg := ""
			if st.Message != nil {
				msg = *st.Message
			}
			logger.Error("tencent sms send failed",
				logger.String("phone", phone),
				logger.String("status_code", *st.Code),
				logger.String("status_message", msg),
				logger.String("request_id", requestID))
			return fmt.Errorf("tencent sms send failed: %s - %s", *st.Code, msg)
		}
	}
	logger.Info("tencent sms sent", logger.String("phone", phone), logger.String("request_id", requestID))
	return nil
}

// e164 把 11 位国内手机号补成 +86 前缀(腾讯云要求 E.164)。
func e164(phone string) string {
	p := strings.TrimSpace(phone)
	if strings.HasPrefix(p, "+") {
		return p
	}
	if len(p) == 11 && strings.HasPrefix(p, "1") {
		return "+86" + p
	}
	return p
}
