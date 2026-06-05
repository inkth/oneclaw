import { auth } from "@/auth";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { ReviewClient } from "./review-client";

export const metadata = { title: "复盘 · GMVMax 数据诊断 · OneClaw" };

export default async function AnalyticsPage() {
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  return <ReviewClient workspaceId={workspace?.id ?? null} />;
}
