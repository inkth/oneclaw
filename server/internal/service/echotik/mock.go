package echotik

// MockRanklist 没配 ECHOTIK 凭证时的 fallback 数据,便于 UI 演示。
func MockRanklist(region string, limit int) []ProductListItem {
	if limit <= 0 || limit > len(mockTemplates) {
		limit = len(mockTemplates)
	}
	out := make([]ProductListItem, 0, limit)
	for i := 0; i < limit; i++ {
		t := mockTemplates[i]
		t.Region = region
		out = append(out, t)
	}
	return out
}

var mockTemplates = []ProductListItem{
	{ProductID: "mock-juicer-380", ProductName: "Portable USB Juicer Cup 380ml - Wireless Mini Blender", CategoryID: "601450", MinPrice: 19.99, MaxPrice: 32.5, SpuAvgPrice: 24.99, ProductCommissionRate: 0.18, TotalSaleCnt: 124000, TotalSaleGmvAmt: 3098000, TotalIflCnt: 1820, TotalVideoCnt: 6420, TotalLiveCnt: 320},
	{ProductID: "mock-led-strip", ProductName: "Smart LED Strip Light 5M with App & Music Sync", CategoryID: "601451", MinPrice: 12.99, MaxPrice: 28.0, SpuAvgPrice: 17.5, ProductCommissionRate: 0.22, TotalSaleCnt: 87500, TotalSaleGmvAmt: 1531250, TotalIflCnt: 942, TotalVideoCnt: 3800, TotalLiveCnt: 140},
	{ProductID: "mock-pet-fountain", ProductName: "Cat Water Fountain Automatic 2L with UV Sterilizer", CategoryID: "601452", MinPrice: 29.99, MaxPrice: 45.99, SpuAvgPrice: 34.99, ProductCommissionRate: 0.15, TotalSaleCnt: 62300, TotalSaleGmvAmt: 2179900, TotalIflCnt: 540, TotalVideoCnt: 2100, TotalLiveCnt: 88},
	{ProductID: "mock-baby-feeder", ProductName: "Silicone Baby Fruit Feeder Pacifier 2-in-1 (3 Pack)", CategoryID: "601453", MinPrice: 8.99, MaxPrice: 16.99, SpuAvgPrice: 12.49, ProductCommissionRate: 0.2, TotalSaleCnt: 95600, TotalSaleGmvAmt: 1193596, TotalIflCnt: 720, TotalVideoCnt: 2900, TotalLiveCnt: 60},
	{ProductID: "mock-camp-light", ProductName: "Multifunctional Camping Lantern - Rechargeable", CategoryID: "601454", MinPrice: 15.99, MaxPrice: 29.99, SpuAvgPrice: 21.5, ProductCommissionRate: 0.17, TotalSaleCnt: 41200, TotalSaleGmvAmt: 885800, TotalIflCnt: 320, TotalVideoCnt: 1180, TotalLiveCnt: 42},
	{ProductID: "mock-busy-board", ProductName: "Montessori Busy Board Toddler Sensory Toy", CategoryID: "601455", MinPrice: 22.99, MaxPrice: 39.99, SpuAvgPrice: 28.99, ProductCommissionRate: 0.16, TotalSaleCnt: 35400, TotalSaleGmvAmt: 1026000, TotalIflCnt: 410, TotalVideoCnt: 1320, TotalLiveCnt: 24},
	{ProductID: "mock-skin-massager", ProductName: "Microcurrent Face Massager Beauty Device", CategoryID: "601456", MinPrice: 39.99, MaxPrice: 79.99, SpuAvgPrice: 54.99, ProductCommissionRate: 0.24, TotalSaleCnt: 28900, TotalSaleGmvAmt: 1589200, TotalIflCnt: 670, TotalVideoCnt: 2400, TotalLiveCnt: 120},
	{ProductID: "mock-bottle-warmer", ProductName: "Portable Baby Bottle Warmer USB Rechargeable", CategoryID: "601453", MinPrice: 19.99, MaxPrice: 34.99, SpuAvgPrice: 24.5, ProductCommissionRate: 0.19, TotalSaleCnt: 31800, TotalSaleGmvAmt: 779100, TotalIflCnt: 280, TotalVideoCnt: 940, TotalLiveCnt: 18},
}
