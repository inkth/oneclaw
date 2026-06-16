package echotik

// 店铺/达人/视频榜的 mock 数据:没配 ECHOTIK 凭证时用于 UI 演示。
// 封面/头像留空(mock 链接无法签名),前端用名字渐变占位。

func MockSellers(region string, limit int) []SellerListItem {
	if limit <= 0 || limit > len(mockSellers) {
		limit = len(mockSellers)
	}
	out := make([]SellerListItem, 0, limit)
	for i := 0; i < limit; i++ {
		t := mockSellers[i]
		t.Region = region
		out = append(out, t)
	}
	return out
}

func MockInfluencers(region string, limit int) []InfluencerListItem {
	if limit <= 0 || limit > len(mockInfluencers) {
		limit = len(mockInfluencers)
	}
	out := make([]InfluencerListItem, 0, limit)
	for i := 0; i < limit; i++ {
		t := mockInfluencers[i]
		t.Region = region
		out = append(out, t)
	}
	return out
}

func MockVideos(region string, limit int) []VideoListItem {
	if limit <= 0 || limit > len(mockVideos) {
		limit = len(mockVideos)
	}
	out := make([]VideoListItem, 0, limit)
	for i := 0; i < limit; i++ {
		t := mockVideos[i]
		t.Region = region
		out = append(out, t)
	}
	return out
}

// MockSearch* 没配凭证时的店铺/达人/视频搜索 fallback(按名称/文案过滤 mock 榜)。
func MockSearchSellers(region, keyword string, limit int) []SellerListItem {
	return filterMock(MockSellers(region, 0), keyword, limit, func(s SellerListItem) string { return s.SellerName })
}

func MockSearchInfluencers(region, keyword string, limit int) []InfluencerListItem {
	return filterMock(MockInfluencers(region, 0), keyword, limit, func(i InfluencerListItem) string { return i.NickName })
}

func MockSearchVideos(region, keyword string, limit int) []VideoListItem {
	return filterMock(MockVideos(region, 0), keyword, limit, func(v VideoListItem) string { return v.VideoDesc })
}

var mockSellers = []SellerListItem{
	{SellerID: "mock-shop-glow", SellerName: "GlowUp Beauty Official", CoverURL: "", Rating: 4.8, MostProductCategoryList: `[{"category_name":"Beauty"},{"category_name":"Skincare"}]`, TotalProductCnt: 320, TotalSaleCnt: 482000, TotalSaleGmvAmt: 9640000, TotalIflCnt: 1240, TotalVideoCnt: 5800, TotalLiveCnt: 420},
	{SellerID: "mock-shop-homify", SellerName: "Homify Living", CoverURL: "", Rating: 4.6, MostProductCategoryList: `[{"category_name":"Home"},{"category_name":"Kitchen"}]`, TotalProductCnt: 210, TotalSaleCnt: 351000, TotalSaleGmvAmt: 5265000, TotalIflCnt: 820, TotalVideoCnt: 3200, TotalLiveCnt: 180},
	{SellerID: "mock-shop-techno", SellerName: "Techno Gadgets Store", CoverURL: "", Rating: 4.5, MostProductCategoryList: `[{"category_name":"Electronics"}]`, TotalProductCnt: 145, TotalSaleCnt: 298000, TotalSaleGmvAmt: 6258000, TotalIflCnt: 640, TotalVideoCnt: 2400, TotalLiveCnt: 96},
	{SellerID: "mock-shop-pawpaw", SellerName: "PawPaw Pet Supplies", CoverURL: "", Rating: 4.7, MostProductCategoryList: `[{"category_name":"Pet"}]`, TotalProductCnt: 188, TotalSaleCnt: 224000, TotalSaleGmvAmt: 4032000, TotalIflCnt: 510, TotalVideoCnt: 1900, TotalLiveCnt: 72},
	{SellerID: "mock-shop-fitlab", SellerName: "FitLab Active", CoverURL: "", Rating: 4.4, MostProductCategoryList: `[{"category_name":"Sports"},{"category_name":"Fitness"}]`, TotalProductCnt: 132, TotalSaleCnt: 187000, TotalSaleGmvAmt: 3927000, TotalIflCnt: 430, TotalVideoCnt: 1620, TotalLiveCnt: 54},
	{SellerID: "mock-shop-littleone", SellerName: "LittleOne Baby", CoverURL: "", Rating: 4.9, MostProductCategoryList: `[{"category_name":"Baby"},{"category_name":"Toys"}]`, TotalProductCnt: 167, TotalSaleCnt: 165000, TotalSaleGmvAmt: 2310000, TotalIflCnt: 380, TotalVideoCnt: 1450, TotalLiveCnt: 40},
	{SellerID: "mock-shop-trendy", SellerName: "Trendy Threads", CoverURL: "", Rating: 4.3, MostProductCategoryList: `[{"category_name":"Fashion"}]`, TotalProductCnt: 412, TotalSaleCnt: 142000, TotalSaleGmvAmt: 2840000, TotalIflCnt: 290, TotalVideoCnt: 1180, TotalLiveCnt: 60},
	{SellerID: "mock-shop-luxe", SellerName: "Luxe Home Decor", CoverURL: "", Rating: 4.6, MostProductCategoryList: `[{"category_name":"Home"},{"category_name":"Decor"}]`, TotalProductCnt: 98, TotalSaleCnt: 118000, TotalSaleGmvAmt: 3186000, TotalIflCnt: 240, TotalVideoCnt: 920, TotalLiveCnt: 28},
}

var mockInfluencers = []InfluencerListItem{
	{UserID: "mock-ifl-mia", UniqueID: "miabeauty", NickName: "Mia ✨ Beauty Picks", Avatar: "", Category: "Beauty", EcScore: 92.5, TotalFollowersCnt: 1820000, TotalDiggCnt: 24800000, TotalProductCnt: 184, TotalPostVideoCnt: 620, TotalLiveCnt: 142, TotalSaleCnt: 96000, TotalSaleGmvAmt: 2880000},
	{UserID: "mock-ifl-jay", UniqueID: "jaytech", NickName: "Jay Tech Reviews", Avatar: "", Category: "Electronics", EcScore: 88.1, TotalFollowersCnt: 1240000, TotalDiggCnt: 15600000, TotalProductCnt: 96, TotalPostVideoCnt: 410, TotalLiveCnt: 38, TotalSaleCnt: 72000, TotalSaleGmvAmt: 3240000},
	{UserID: "mock-ifl-sara", UniqueID: "sarahome", NickName: "Sara's Cozy Home", Avatar: "", Category: "Home", EcScore: 85.7, TotalFollowersCnt: 980000, TotalDiggCnt: 12100000, TotalProductCnt: 142, TotalPostVideoCnt: 530, TotalLiveCnt: 86, TotalSaleCnt: 58000, TotalSaleGmvAmt: 1450000},
	{UserID: "mock-ifl-leo", UniqueID: "leofit", NickName: "Leo Fitness", Avatar: "", Category: "Sports", EcScore: 83.2, TotalFollowersCnt: 760000, TotalDiggCnt: 9800000, TotalProductCnt: 64, TotalPostVideoCnt: 290, TotalLiveCnt: 52, TotalSaleCnt: 44000, TotalSaleGmvAmt: 1320000},
	{UserID: "mock-ifl-emma", UniqueID: "emmamom", NickName: "Emma | Mom Life", Avatar: "", Category: "Baby", EcScore: 81.9, TotalFollowersCnt: 690000, TotalDiggCnt: 8400000, TotalProductCnt: 118, TotalPostVideoCnt: 470, TotalLiveCnt: 34, TotalSaleCnt: 39000, TotalSaleGmvAmt: 780000},
	{UserID: "mock-ifl-kai", UniqueID: "kaistyle", NickName: "Kai Style Daily", Avatar: "", Category: "Fashion", EcScore: 79.4, TotalFollowersCnt: 1120000, TotalDiggCnt: 14200000, TotalProductCnt: 206, TotalPostVideoCnt: 680, TotalLiveCnt: 28, TotalSaleCnt: 35000, TotalSaleGmvAmt: 700000},
	{UserID: "mock-ifl-nora", UniqueID: "norapets", NickName: "Nora & Pets", Avatar: "", Category: "Pet", EcScore: 77.8, TotalFollowersCnt: 540000, TotalDiggCnt: 7100000, TotalProductCnt: 72, TotalPostVideoCnt: 320, TotalLiveCnt: 46, TotalSaleCnt: 31000, TotalSaleGmvAmt: 620000},
	{UserID: "mock-ifl-tom", UniqueID: "tomkitchen", NickName: "Tom's Kitchen Hacks", Avatar: "", Category: "Kitchen", EcScore: 75.3, TotalFollowersCnt: 820000, TotalDiggCnt: 10500000, TotalProductCnt: 88, TotalPostVideoCnt: 360, TotalLiveCnt: 22, TotalSaleCnt: 27000, TotalSaleGmvAmt: 540000},
}

var mockVideos = []VideoListItem{
	{VideoID: "mock-vid-1", NickName: "Mia ✨ Beauty Picks", UniqueID: "miabeauty", ReflowCover: "", Avatar: "", VideoDesc: "This $20 serum changed my skin in 2 weeks 🤯 #skincare #tiktokmademebuyit", Category: "Beauty", Duration: 32, CreateTime: "1717200000", TotalViewsCnt: 4820000, TotalDiggCnt: 612000, TotalCommentsCnt: 18400, TotalSharesCnt: 42000, TotalVideoSaleCnt: 12400, TotalVideoSaleGmvAmt: 310000},
	{VideoID: "mock-vid-2", NickName: "Jay Tech Reviews", UniqueID: "jaytech", ReflowCover: "", Avatar: "", VideoDesc: "The wireless charger everyone is obsessed with ⚡ honest review", Category: "Electronics", Duration: 48, CreateTime: "1717113600", TotalViewsCnt: 3120000, TotalDiggCnt: 284000, TotalCommentsCnt: 9600, TotalSharesCnt: 21000, TotalVideoSaleCnt: 8600, TotalVideoSaleGmvAmt: 258000},
	{VideoID: "mock-vid-3", NickName: "Sara's Cozy Home", UniqueID: "sarahome", ReflowCover: "", Avatar: "", VideoDesc: "Organizing my kitchen with these viral containers 🧺✨", Category: "Home", Duration: 27, CreateTime: "1717027200", TotalViewsCnt: 2640000, TotalDiggCnt: 198000, TotalCommentsCnt: 7200, TotalSharesCnt: 15400, TotalVideoSaleCnt: 6200, TotalVideoSaleGmvAmt: 93000},
	{VideoID: "mock-vid-4", NickName: "Leo Fitness", UniqueID: "leofit", ReflowCover: "", Avatar: "", VideoDesc: "Resistance bands > gym? trying this for 30 days 💪", Category: "Sports", Duration: 41, CreateTime: "1716940800", TotalViewsCnt: 1980000, TotalDiggCnt: 142000, TotalCommentsCnt: 5400, TotalSharesCnt: 11200, TotalVideoSaleCnt: 4800, TotalVideoSaleGmvAmt: 144000},
	{VideoID: "mock-vid-5", NickName: "Emma | Mom Life", UniqueID: "emmamom", ReflowCover: "", Avatar: "", VideoDesc: "Baby must-haves I wish I knew about sooner 🍼", Category: "Baby", Duration: 35, CreateTime: "1716854400", TotalViewsCnt: 1740000, TotalDiggCnt: 121000, TotalCommentsCnt: 6800, TotalSharesCnt: 9400, TotalVideoSaleCnt: 4100, TotalVideoSaleGmvAmt: 61500},
	{VideoID: "mock-vid-6", NickName: "Kai Style Daily", UniqueID: "kaistyle", ReflowCover: "", Avatar: "", VideoDesc: "Styling one jacket 5 ways for fall 🍂 #ootd", Category: "Fashion", Duration: 29, CreateTime: "1716768000", TotalViewsCnt: 1520000, TotalDiggCnt: 108000, TotalCommentsCnt: 4200, TotalSharesCnt: 8600, TotalVideoSaleCnt: 3400, TotalVideoSaleGmvAmt: 68000},
	{VideoID: "mock-vid-7", NickName: "Nora & Pets", UniqueID: "norapets", ReflowCover: "", Avatar: "", VideoDesc: "My cat is obsessed with this water fountain 🐱💧", Category: "Pet", Duration: 24, CreateTime: "1716681600", TotalViewsCnt: 1310000, TotalDiggCnt: 96000, TotalCommentsCnt: 3800, TotalSharesCnt: 7100, TotalVideoSaleCnt: 2900, TotalVideoSaleGmvAmt: 87000},
	{VideoID: "mock-vid-8", NickName: "Tom's Kitchen Hacks", UniqueID: "tomkitchen", ReflowCover: "", Avatar: "", VideoDesc: "This veggie chopper saves me 20 min every night 🔪", Category: "Kitchen", Duration: 38, CreateTime: "1716595200", TotalViewsCnt: 1180000, TotalDiggCnt: 84000, TotalCommentsCnt: 3100, TotalSharesCnt: 6200, TotalVideoSaleCnt: 2600, TotalVideoSaleGmvAmt: 39000},
}
