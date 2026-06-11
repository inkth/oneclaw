import { getMe, apiServer } from "@/lib/api-client";
import { MaterialsClient } from "./materials-client";

export const metadata = { title: "素材库 · OneClaw" };

type Initial = Parameters<typeof MaterialsClient>[0]["initialMaterials"];

export default async function MaterialsPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  let materials: Initial = [];
  if (ws) {
    try {
      materials = (await apiServer<{ materials: Initial }>(`/workspaces/${ws.id}/materials`)).materials ?? [];
    } catch {
      materials = [];
    }
  }
  return (
    // key：弹窗内登录后 refresh 重传 props，强制重挂载以重置 useState(initial*)
    <MaterialsClient
      key={me?.user?.id ?? "guest"}
      workspaceId={ws?.id ?? ""}
      initialMaterials={materials}
      isGuest={!ws}
      storageReady={!!ws}
      storageDriver="tencent-cos"
    />
  );
}
