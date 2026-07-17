package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/faxianmao/server/internal/logger"
	"github.com/faxianmao/server/internal/model"
	"github.com/faxianmao/server/internal/service/llm"
	"github.com/faxianmao/server/internal/storage"
)

// ── 预置人设库种子(./server --seed-personas 一次性执行)──────────────────────
//
// 用 seedream(OpenRouter,国内直连)生成全局预置数字人:每个人设 4 张参考图
// (正脸文生图出底图,半身/侧脸/场景以底图为参考图锚定同一张脸),
// 全部传 COS 后写入 model_assets(is_preset=true,workspace_id 为空,所有工作台可见)。
// 幂等:同名预置已存在则跳过;单个人设失败不影响整批。

// UGC 实拍感:压住 stock photo 式的精修假人
const personaStyleSuffix = "amateur smartphone photo, natural skin texture, candid expression, " +
	"soft daylight, photorealistic, looking at camera, no text, no watermark"

type presetPersona struct {
	Slug   string // COS 目录名
	Name   string // 展示名
	Gender string // FEMALE | MALE
	Style  string // 选择列表里的风格标签
	Desc   string // 人设描述(中文,日后注入 DIRECTOR 用)
	Look   string // 外观提示词(英文,生成用,也随档案存)
}

var presetPersonas = []presetPersona{
	{"mia-bestie", "Mia · 邻家闺蜜", "FEMALE", "闺蜜种草",
		"亲切自然的邻家女孩,语气像闺蜜安利好物,适合美妆/家居/小物件。",
		"young american woman in her early 20s, friendly girl-next-door look, shoulder-length brown hair, light freckles, casual pastel hoodie"},
	{"jake-fitness", "Jake · 健身教练", "MALE", "健身能量",
		"阳光健身教练,语速快有感染力,适合运动装备/健康食品/户外。",
		"athletic american man in his late 20s, short dark hair, defined jawline, fitted gym t-shirt, energetic confident vibe"},
	{"emma-mom", "Emma · 实用派宝妈", "FEMALE", "家庭实用",
		"务实可信的年轻妈妈,讲究性价比和安全,适合母婴/厨房/收纳。",
		"warm american mother in her early 30s, blonde hair in a loose bun, soft cardigan, kind tired-but-happy smile, cozy home feel"},
	{"leo-tech", "Leo · 科技测评党", "MALE", "科技测评",
		"冷静客观的数码测评人,爱讲参数对比,适合 3C/智能家居/工具。",
		"asian-american man in his mid 20s, black-rimmed glasses, neat side-part hair, dark minimalist crewneck, smart analytical look"},
	{"sofia-glam", "Sofia · 美妆达人", "FEMALE", "美妆精致",
		"妆容精致表达力强,擅长 before/after 演示,适合美妆/护肤/饰品。",
		"latina woman in her mid 20s, glowing makeup, long wavy dark hair, gold hoop earrings, expressive eyes, beauty influencer look"},
	{"david-dad", "David · 靠谱老爸", "MALE", "成熟稳重",
		"沉稳中年男性,实话实说的工具人设,适合五金/汽配/园艺/烧烤。",
		"american man in his mid 40s, short salt-and-pepper beard, plaid flannel shirt, trustworthy handyman dad look"},
	{"chloe-student", "Chloe · 学生党省钱", "FEMALE", "学生平价",
		"活泼大学生,主打平价好物和宿舍改造,适合文具/小家电/宿舍收纳。",
		"college-age woman, 19 years old, playful smile, ponytail with claw clip, oversized vintage tee, dorm room energy"},
	{"marcus-street", "Marcus · 潮流玩家", "MALE", "街头潮流",
		"街头潮流爱好者,节奏快有态度,适合潮鞋/服饰/配件/电竞周边。",
		"black american man in his early 20s, short twists hairstyle, streetwear fit with chain necklace, confident relaxed style"},
	{"grace-senior", "Grace · 优雅银发", "FEMALE", "银发优雅",
		"优雅从容的银发女性,亲和有说服力,适合健康/舒适家居/礼品。",
		"elegant american woman in her early 60s, silver bob haircut, light linen blouse, warm graceful smile"},
	{"ryan-outdoor", "Ryan · 户外玩家", "MALE", "户外探险",
		"热爱露营徒步的户外咖,实测场景感强,适合露营装备/水壶/手电。",
		"rugged american man around 30, light stubble, sun-tanned skin, olive outdoor jacket and beanie, adventurous grin"},
	{"nina-minimal", "Nina · 极简生活", "FEMALE", "极简质感",
		"安静极简的生活方式博主,审美在线,适合香薰/陶瓷/桌面好物。",
		"minimalist east-asian woman in her late 20s, sleek low bun, beige turtleneck, calm serene expression, japandi aesthetic"},
	{"tom-petdad", "Tom · 宠物奶爸", "MALE", "萌宠日常",
		"养猫养狗的暖男,日常感强互动多,适合宠物用品/清洁/零食。",
		"friendly american man in his late 20s, curly light-brown hair, soft smile, casual denim shirt with a few pet hairs, approachable pet-lover vibe"},
}

// personaShots 底图之外的补充镜头:用 edit 以正脸为参考,保持同一张脸。
var personaShots = []struct {
	Key    string
	Prompt string
	Size   string
}{
	{"half", "the exact same person, waist-up half body shot facing the camera, same face and hairstyle, plain warm neutral background", "3:4"},
	{"side", "the exact same person, 45 degree side angle portrait, same face and hairstyle, natural window light, plain neutral background", "3:4"},
	{"scene", "the exact same person filming a casual selfie-style product video at home, holding a small unbranded box, cozy room background, vlog feel", "3:4"},
}

type PersonaSeeder struct {
	db  *gorm.DB
	llm *llm.Client
	st  *storage.Storage
}

func NewPersonaSeeder(db *gorm.DB, l *llm.Client, st *storage.Storage) *PersonaSeeder {
	return &PersonaSeeder{db: db, llm: l, st: st}
}

// Run 全量生成预置人设库。返回 (新建数, 错误)。
func (s *PersonaSeeder) Run(ctx context.Context) (int, error) {
	if !s.llm.Configured() {
		return 0, fmt.Errorf("OPENROUTER_API_KEY 未配置,无法生成人设图")
	}
	if !s.st.Configured() {
		return 0, fmt.Errorf("COS 未配置,无法存储人设图")
	}
	created := 0
	for _, p := range presetPersonas {
		var n int64
		s.db.WithContext(ctx).Model(&model.ModelAsset{}).
			Where("is_preset = TRUE AND name = ?", p.Name).Count(&n)
		if n > 0 {
			logger.Info("[persona] 已存在,跳过", logger.String("name", p.Name))
			continue
		}
		urls, err := s.generateSet(ctx, p)
		if err != nil {
			logger.Warn("[persona] 生成失败,跳过该人设", logger.String("name", p.Name), logger.Err(err))
			continue
		}
		refs, _ := json.Marshal(urls)
		style, desc, look := p.Style, p.Desc, p.Look
		full := desc + "\n外观提示词:" + look
		m := model.ModelAsset{
			IsPreset:     true,
			Name:         p.Name,
			Kind:         model.ModelKindDigitalHuman,
			Gender:       p.Gender,
			Style:        &style,
			Description:  &full,
			AvatarURL:    &urls[0],
			PreviewURL:   &urls[1],
			RefImageURLs: model.JSONB(refs),
		}
		if err := s.db.WithContext(ctx).Create(&m).Error; err != nil {
			logger.Warn("[persona] 落库失败", logger.String("name", p.Name), logger.Err(err))
			continue
		}
		created++
		logger.Info("[persona] 已入库", logger.String("name", p.Name), logger.String("avatar", urls[0]))
	}
	return created, nil
}

// genWithRetry 调 seedream 出图(国内直连,单图限时 10 分钟),最多 3 次尝试。
// aspect 传画幅比例("1:1"/"3:4" 等);refs 非空时作为参考图锚定同一张脸。
func (s *PersonaSeeder) genWithRetry(ctx context.Context, prompt, aspect string, refs []string) ([]byte, string, error) {
	gen := func() ([]byte, string, error) {
		gctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
		defer cancel()
		return s.llm.GenerateImage(gctx, prompt, aspect, refs)
	}
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		data, ct, err := gen()
		if err == nil {
			return data, ct, nil
		}
		lastErr = err
		logger.Warn("[persona] 出图失败", logger.Err(err))
	}
	return nil, "", lastErr
}

// generateSet 产一个人设的 4 张图:正脸底图(t2i) + 半身/侧脸/场景(edit 参考底图)。
// 返回 COS URL 列表,顺序固定 [face, half, side, scene]。
func (s *PersonaSeeder) generateSet(ctx context.Context, p presetPersona) ([]string, error) {
	facePrompt := fmt.Sprintf("close-up front portrait of %s, %s, plain warm neutral background", p.Look, personaStyleSuffix)
	data, ct, err := s.genWithRetry(ctx, facePrompt, "1:1", nil)
	if err != nil {
		return nil, fmt.Errorf("正脸底图: %w", err)
	}
	faceURL, err := s.putImage(ctx, p.Slug, "face", data, ct)
	if err != nil {
		return nil, fmt.Errorf("正脸上传: %w", err)
	}
	urls := []string{faceURL}
	for _, shot := range personaShots {
		prompt := shot.Prompt + ", " + personaStyleSuffix
		data, ct, err := s.genWithRetry(ctx, prompt, shot.Size, []string{faceURL})
		if err != nil {
			return nil, fmt.Errorf("%s 镜头: %w", shot.Key, err)
		}
		u, err := s.putImage(ctx, p.Slug, shot.Key, data, ct)
		if err != nil {
			return nil, fmt.Errorf("%s 上传: %w", shot.Key, err)
		}
		urls = append(urls, u)
	}
	return urls, nil
}

// putImage 把出图字节转 webp(体积约省 90%)后传 COS;转码失败回退原格式,不阻断 seed。
func (s *PersonaSeeder) putImage(ctx context.Context, slug, key string, data []byte, ct string) (string, error) {
	if webpData, err := toWebp(data); err == nil {
		return s.st.Put(ctx, "models/presets/"+slug+"/"+key+".webp", webpData, "image/webp")
	} else {
		logger.Warn("[persona] webp 转码失败,存原图", logger.String("key", key), logger.Err(err))
	}
	ext := ".jpg"
	if strings.Contains(ct, "png") {
		ext = ".png"
	}
	return s.st.Put(ctx, "models/presets/"+slug+"/"+key+ext, data, ct)
}

// toWebp 用 cwebp(libwebp-tools,镜像内置)把图片字节转 webp(q82)。
func toWebp(data []byte) ([]byte, error) {
	tin, err := os.CreateTemp("", "persona-*.img")
	if err != nil {
		return nil, err
	}
	defer os.Remove(tin.Name())
	if _, err := tin.Write(data); err != nil {
		tin.Close()
		return nil, err
	}
	tin.Close()
	tout := tin.Name() + ".webp"
	defer os.Remove(tout)
	if out, err := exec.Command("cwebp", "-q", "82", "-quiet", tin.Name(), "-o", tout).CombinedOutput(); err != nil {
		return nil, fmt.Errorf("cwebp: %v %s", err, out)
	}
	return os.ReadFile(tout)
}
