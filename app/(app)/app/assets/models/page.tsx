import { getMe, apiServer } from "@/lib/api-client";
import { ModelsClient } from "./models-client";

export const metadata = { title: "模特 · OneClaw" };

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
  return <ModelsClient workspaceId={ws?.id ?? ""} initialModels={models} isGuest={!ws} />;
}
