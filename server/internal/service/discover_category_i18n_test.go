package service

import "testing"

// 词典按 category_id 对齐后应长这样(节选自 /echotik/category/l1 各语言返回)。
func testDict() categoryZhDict {
	return categoryZhDict{
		normalizeCategoryKey("Computers & Office Equipment"): "电脑办公",
		normalizeCategoryKey("Komputer & Peralatan Kantor"):  "电脑办公",
		normalizeCategoryKey("Beauty & Personal Care"):       "美妆个护",
		normalizeCategoryKey("Perawatan & Kecantikan"):       "美妆个护",
		normalizeCategoryKey("ความงามและของใช้ส่วนตัว"):      "美妆个护",
		normalizeCategoryKey("Điện thoại & Đồ điện tử"):      "手机与数码",
	}
}

func TestCategoryZhDictNames(t *testing.T) {
	d := testDict()
	cases := []struct{ in, want string }{
		{"Computers & Office Equipment", "电脑办公"},
		{"Komputer & Peralatan Kantor", "电脑办公"},    // 印尼语市场返回的本地名
		{"ความงามและของใช้ส่วนตัว", "美妆个护"},        // 泰语市场
		{"Điện thoại & đồ điện tử", "手机与数码"},       // 存量数据的旧写法,只差大小写 → 归一化后仍命中
		{"Some New Category", "Some New Category"}, // 表外的值回落原文,不吞数据
		{"", ""},
	}
	for _, c := range cases {
		if got := d.Name(c.in); got != c.want {
			t.Errorf("Name(%q) = %q, want %q", c.in, got, c.want)
		}
	}

	got := d.Names([]string{"Beauty & Personal Care", "Perawatan & Kecantikan"})
	if len(got) != 2 || got[0] != "美妆个护" || got[1] != "美妆个护" {
		t.Errorf("Names() = %v, want [美妆个护 美妆个护]", got)
	}
}

// 词典为空(EchoTik 未配置/拉取失败)时必须整串回落原文,不能返回空。
func TestCategoryZhDictZeroValue(t *testing.T) {
	var d categoryZhDict
	if got := d.Name("Beauty & Personal Care"); got != "Beauty & Personal Care" {
		t.Errorf("零值词典应回落原文,得到 %q", got)
	}
	if got := d.Names([]string{"Shoes"}); len(got) != 1 || got[0] != "Shoes" {
		t.Errorf("零值词典 Names 应回落原文,得到 %v", got)
	}
}

// 旧写法表的键必须是归一化形态,否则永远命不中。
func TestLegacyCategoryKeysNormalized(t *testing.T) {
	for k, v := range legacyCategoryZh {
		if k != normalizeCategoryKey(k) {
			t.Errorf("legacyCategoryZh 键 %q 未归一化", k)
		}
		if v == "" {
			t.Errorf("legacyCategoryZh[%q] 为空", k)
		}
	}
	d := categoryZhDict{}
	for k, v := range legacyCategoryZh {
		d[k] = v
	}
	if got := d.Name("Ponsel & Elektronik"); got != "手机与数码" {
		t.Errorf("旧写法未命中,得到 %q", got)
	}
}

func TestZhInfluencerCategory(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Media & Entertainment", "影视娱乐"},
		{"Shopping & Retail", "购物零售"},
		{"Personal Blog", "个人博主"},
		{"Sports, Fitness & Outdoors", "运动健身户外"},
		{"Home, Furniture & Appliances", "家居家电"},
		{"Other", "其他"},
		{"Unmapped Vertical", "Unmapped Vertical"},
		{"", ""},
	}
	for _, c := range cases {
		if got := zhInfluencerCategory(c.in); got != c.want {
			t.Errorf("zhInfluencerCategory(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// 线上实际出现过的 19 个达人领域值必须全部有中文,漏一个就会在榜单里露英文。
func TestInfluencerCategoryCoversObserved(t *testing.T) {
	observed := []string{
		"Art & Crafts", "Automotive & Transportation", "Baby", "Beauty",
		"Clothing & Accessories", "Education & Training", "Food & Beverage",
		"Gaming", "Government Affairs", "Health & Wellness",
		"Home, Furniture & Appliances", "IT & High-Tech", "Media & Entertainment",
		"Music & Dance", "Other", "Personal Blog", "Public Figure",
		"Shopping & Retail", "Sports, Fitness & Outdoors",
	}
	for _, name := range observed {
		if zhInfluencerCategory(name) == name {
			t.Errorf("达人领域 %q 没有中文映射", name)
		}
	}
}
