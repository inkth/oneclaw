import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { ModelsClient } from "./models-client";

export const metadata = { title: "模特 · OneClaw" };

export default async function ModelsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  const models = await prisma.modelAsset.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
  });

  return (
    <ModelsClient
      workspaceId={workspace.id}
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
