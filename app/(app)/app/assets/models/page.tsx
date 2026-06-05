import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { ModelsClient } from "./models-client";

export const metadata = { title: "模特 · OneClaw" };

export default async function ModelsPage() {
  // 游客也能看（空态）；动手的动作再提示登录
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  const models = workspace
    ? await prisma.modelAsset.findMany({
        where: { workspaceId: workspace.id },
        orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
      })
    : [];

  return (
    <ModelsClient
      isGuest={!workspace}
      workspaceId={workspace?.id ?? ""}
      initialModels={models.map((m) => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        gender: m.gender,
        style: m.style,
        description: m.description,
        avatarUrl: m.avatarUrl,
        usageCount: m.usageCount,
        isFavorite: m.isFavorite,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
