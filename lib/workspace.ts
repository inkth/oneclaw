import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session.user;
}

export async function getOrCreateDefaultWorkspace(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (membership) return membership.workspace;

  const slug = `ws-${userId.slice(0, 8)}`;
  return prisma.workspace.create({
    data: {
      name: "默认工作台",
      slug,
      ownerId: userId,
      members: { create: { userId, role: "OWNER" } },
    },
  });
}
