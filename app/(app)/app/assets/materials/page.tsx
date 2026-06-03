import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { isStorageConfigured, getStorageName } from "@/lib/storage";
import { MaterialsClient } from "./materials-client";

export const metadata = { title: "素材库 · OneClaw" };

export default async function MaterialsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  const materials = await prisma.material.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <MaterialsClient
      workspaceId={workspace.id}
      storageReady={isStorageConfigured()}
      storageDriver={getStorageName()}
      initialMaterials={materials.map((m) => ({
        id: m.id,
        type: m.type,
        originalName: m.originalName,
        url: m.url,
        contentType: m.contentType,
        sizeBytes: m.sizeBytes,
        tags: m.tags,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
