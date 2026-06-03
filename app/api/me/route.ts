import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { ok, fail, handleError } from "@/lib/api";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);

    const workspace = await getOrCreateDefaultWorkspace(session.user.id);
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, phone: true, email: true, name: true, image: true, createdAt: true },
    });

    return ok({ user, workspace });
  } catch (err) {
    return handleError(err);
  }
}
