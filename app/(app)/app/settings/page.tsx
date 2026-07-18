import { redirect } from "next/navigation";
import { getMe, apiServer } from "@/lib/api-client";
import { SettingsClient, type Usage } from "./settings-client";

export const metadata = { title: "设置 · 发现猫" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { upgrade } = await searchParams;

  let usage: Usage | null = null;
  try {
    const d = await apiServer<{ usage: Usage }>(`/workspaces/${me.workspace.id}/usage`);
    usage = d.usage;
  } catch {
    usage = null;
  }

  return (
    <SettingsClient
      key={me.user.id}
      user={me.user}
      workspace={me.workspace}
      usage={usage}
      initialUpgrade={upgrade === "PRO" || upgrade === "TEAM" ? upgrade : null}
    />
  );
}
