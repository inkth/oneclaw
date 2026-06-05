import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { isStorageConfigured, getStorageName } from "@/lib/storage";
import { MaterialsClient } from "./materials-client";

export const metadata = { title: "素材库 · OneClaw" };

export default async function MaterialsPage() {
  // 游客也能看（空态）；动手的动作再提示登录
  const session = await auth();
  const workspace = session?.user?.id
    ? await getOrCreateDefaultWorkspace(session.user.id)
    : null;

  const materials = workspace
    ? await prisma.material.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <MaterialsClient
      isGuest={!workspace}
      workspaceId={workspace?.id ?? ""}
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
