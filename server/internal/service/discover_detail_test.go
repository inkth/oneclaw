package service

import "testing"

func TestTiktokVideoURL(t *testing.T) {
	if got := tiktokVideoURL("7351234567890"); got != "https://www.tiktok.com/@_/video/7351234567890" {
		t.Errorf("构造链接错误: %s", got)
	}
	if got := tiktokVideoURL(""); got != "" {
		t.Errorf("空 videoID 应返回空,得到 %s", got)
	}
}

func TestNormalizeVideoPlayAddrs(t *testing.T) {
	vids := []ProductVideoDTO{
		{VideoID: "v1", PlayAddr: "https://v16m.tiktokcdn.com/xxx?sign=expired"}, // 历史落库的签名地址 → 重写
		{VideoID: "v2", PlayAddr: "https://www.tiktok.com/@_/video/v2"},          // 已是公开链接 → 保持
		{VideoID: "", PlayAddr: "https://v16m.tiktokcdn.com/yyy"},                // 无 ID → 置空
	}
	normalizeVideoPlayAddrs(vids)
	if vids[0].PlayAddr != "https://www.tiktok.com/@_/video/v1" {
		t.Errorf("签名地址未重写: %s", vids[0].PlayAddr)
	}
	if vids[1].PlayAddr != "https://www.tiktok.com/@_/video/v2" {
		t.Errorf("公开链接不应改动: %s", vids[1].PlayAddr)
	}
	if vids[2].PlayAddr != "" {
		t.Errorf("无 ID 应置空: %s", vids[2].PlayAddr)
	}
}
