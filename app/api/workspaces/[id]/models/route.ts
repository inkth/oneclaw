import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["DIGITAL_HUMAN", "REAL_PERSON"]).default("DIGITAL_HUMAN"),
  gender: z.enum(["FEMALE", "MALE", "NEUTRAL"]).default("NEUTRAL"),
  style: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const models = await prisma.modelAsset.findMany({
      where: { workspaceId: id },
      orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
    });
    return ok({ models });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const body = await req.json();
    const data = createSchema.parse(body);

    const model = await prisma.modelAsset.create({
      data: { ...data, workspaceId: id },
    });
    return ok({ model }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
