import { getMe, apiServer } from "@/lib/api-client";
import { fetchCategories } from "./_components/categories";
import { REGION_CODES, type Region } from "./_components/regions";
import { ScoutClient, type DailyReport } from "./scout-client";

export const metadata = { title: "选品 · AI 选品官 · 发现猫" };

// 选品板块门面:选品官 Agent 页(每日报告 + 追问对话)。
// 报告按 (日期×区域×类目) 全局共享,游客可看;追问对话需登录。
// 四个榜单页降级为板块内 Tab,承担报告结论的「数据证据页」。
export default async function DiscoverScoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  const sp = await searchParams;
  const region = REGION_CODES.includes((sp.region ?? "") as Region)
    ? (sp.region as Region)
    : "US";
  const categoryId = sp.category_id || null;

  const query = `region=${region}${categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : ""}`;
  const [report, categories] = await Promise.all([
    apiServer<DailyReport>(
      workspace
        ? `/workspaces/${workspace.id}/discover/report?${query}`
        : `/discover/report?${query}`,
    ).catch((): DailyReport | null => null),
    fetchCategories(region),
  ]);

  return (
    <ScoutClient
      isGuest={!workspace}
      workspaceId={workspace?.id ?? ""}
      region={region}
      categoryId={categoryId}
      categories={categories}
      initialReport={report}
    />
  );
}
