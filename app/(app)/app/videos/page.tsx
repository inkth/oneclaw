import { getMe, apiServer } from "@/lib/api-client";
import { VideosClient } from "./videos-client";

export const metadata = { title: "短视频 · 发现猫" };

type Initial = Parameters<typeof VideosClient>[0]["initialVideos"];

export default async function VideosPage() {
  const me = await getMe();
  const ws = me?.workspace ?? null;
  let videos: Initial = [];
  if (ws) {
    try {
      videos = (await apiServer<{ videos: Initial }>(`/workspaces/${ws.id}/videos`)).videos ?? [];
    } catch {
      videos = [];
    }
  }
  return <VideosClient workspaceId={ws?.id ?? ""} initialVideos={videos} />;
}
