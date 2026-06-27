import { getMe, apiServer } from "@/lib/api-client";
import { ModelsClient } from "./models-client";

export const metadata = { title: "模特 · 发现猫" };

type Initial = Parameters<typeof ModelsClient>[0]["initialModels"];

export default async function ModelsPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  let models: Initial = [];
  if (ws) {
    try {
      models = (await apiServer<{ models: Initial }>(`/workspaces/${ws.id}/models`)).models ?? [];
    } catch {
      models = [];
    }
  }
  // key：弹窗内登录后 refresh 重传 props，强制重挂载以重置 useState(initial*)
  return <ModelsClient key={me?.user?.id ?? "guest"} workspaceId={ws?.id ?? ""} initialModels={models} isGuest={!ws} />;
}
