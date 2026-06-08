import { getMe } from "@/lib/api-client";
import { ReviewClient } from "./review-client";

export const metadata = { title: "复盘 · GMVMax 数据诊断 · OneClaw" };

export default async function AnalyticsPage() {
  // 游客可进页面查看说明,但上传分析需登录(走 Go 后端的 workspace 端点)。
  const me = await getMe();
  return <ReviewClient workspaceId={me?.workspace?.id ?? null} />;
}
