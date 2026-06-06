// Package storage 封装腾讯云 COS 对象存储:上传 / 删除 / URL 生成。
package storage

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/tencentyun/cos-go-sdk-v5"

	"github.com/oneclaw/server/internal/config"
)

// Storage 是对象存储抽象。未配置 COS 时 Configured()=false,上传返回错误。
type Storage struct {
	client *cos.Client
	cfg    config.StorageConfig
}

// New 构造 COS 存储。未配置凭证时返回一个 Configured()=false 的实例(不报错)。
func New(cfg config.StorageConfig) *Storage {
	s := &Storage{cfg: cfg}
	if !cfg.Configured() {
		return s
	}
	u, _ := url.Parse(fmt.Sprintf("https://%s.cos.%s.myqcloud.com", cfg.COSBucket, cfg.COSRegion))
	s.client = cos.NewClient(&cos.BaseURL{BucketURL: u}, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  cfg.COSSecretID,
			SecretKey: cfg.COSSecretKey,
		},
	})
	return s
}

func (s *Storage) Configured() bool { return s.client != nil }

// Put 上传字节到 key,返回可访问 URL(优先自定义 CDN 域名)。
func (s *Storage) Put(ctx context.Context, key string, body []byte, contentType string) (string, error) {
	if s.client == nil {
		return "", fmt.Errorf("storage: COS 未配置")
	}
	key = strings.TrimPrefix(key, "/")
	opt := &cos.ObjectPutOptions{
		ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{
			ContentType:  contentType,
			CacheControl: "public, max-age=31536000, immutable",
		},
	}
	if _, err := s.client.Object.Put(ctx, key, bytes.NewReader(body), opt); err != nil {
		return "", fmt.Errorf("storage: COS 上传失败: %w", err)
	}
	return s.URLFor(key), nil
}

// Delete 删除一个对象(key 不存在视为成功)。
func (s *Storage) Delete(ctx context.Context, key string) error {
	if s.client == nil {
		return fmt.Errorf("storage: COS 未配置")
	}
	key = strings.TrimPrefix(key, "/")
	if _, err := s.client.Object.Delete(ctx, key); err != nil {
		return fmt.Errorf("storage: COS 删除失败: %w", err)
	}
	return nil
}

// URLFor 返回 key 的公开访问 URL。
func (s *Storage) URLFor(key string) string {
	key = strings.TrimPrefix(key, "/")
	if domain := strings.TrimRight(s.cfg.COSDomain, "/"); domain != "" {
		return domain + "/" + key
	}
	return fmt.Sprintf("https://%s.cos.%s.myqcloud.com/%s", s.cfg.COSBucket, s.cfg.COSRegion, key)
}
