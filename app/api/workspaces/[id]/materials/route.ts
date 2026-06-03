import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ok, fail, handleError } from "@/lib/api";
import {
  uploadBuffer,
  deriveMaterialPath,
  isStorageConfigured,
} from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";
import type { MaterialType } from "@prisma/client";

export const maxDuration = 60;

const MAX_BYTES = 50 * 1024 * 1024; // 50MB per file
const TYPE_MAP: Array<[RegExp, MaterialType]> = [
  [/^image\//, "IMAGE"],
  [/^video\//, "VIDEO"],
  [/^audio\//, "AUDIO"],
  [/^font\//, "FONT"],
];

function detectType(contentType: string, hintName?: string): MaterialType {
  for (const [re, t] of TYPE_MAP) if (re.test(contentType)) return t;
  if (hintName && /\.(woff2?|ttf|otf)$/i.test(hintName)) return "FONT";
  return "IMAGE";
}

async function authorize(workspaceId: string, userId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return !!m;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return fail("未登录", 401);
    const { id } = await params;
    if (!(await authorize(id, session.user.id))) return fail("无权访问", 403);

    const url = new URL(req.url);
    const type = url.searchParams.get("type") as MaterialType | null;

    const materials = await prisma.material.findMany({
      where: {
        workspaceId: id,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return ok({ materials });
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

    if (!isStorageConfigured()) {
      return fail(
        "存储未配置：请在 .env 中填写 TENCENT_COS_BUCKET/REGION 或 BLOB_READ_WRITE_TOKEN",
        503,
      );
    }

    const rl = await rateLimit({
      key: `material-upload:${id}`,
      limit: 60,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("上传过于频繁，请稍后再试", 429);

    const form = await req.formData();
    const file = form.get("file");
    const tagsRaw = String(form.get("tags") ?? "").trim();
    const note = String(form.get("note") ?? "").trim() || undefined;

    if (!(file instanceof File)) return fail("缺少文件", 400);
    if (file.size > MAX_BYTES) return fail(`文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`, 400);

    const contentType = file.type || "application/octet-stream";
    const type = detectType(contentType, file.name);
    const buf = Buffer.from(await file.arrayBuffer());

    // 先创建一条 Material 占位，拿到 id 再算 storageKey 上传
    const placeholder = await prisma.material.create({
      data: {
        workspaceId: id,
        type,
        originalName: file.name,
        url: "", // 上传完更新
        contentType,
        sizeBytes: file.size,
        tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
        note,
      },
    });

    const storageKey = deriveMaterialPath(id, placeholder.id, file.name);
    const result = await uploadBuffer({
      buf,
      pathname: storageKey,
      contentType,
    });

    if (!result) {
      await prisma.material.delete({ where: { id: placeholder.id } });
      return fail("上传失败：存储服务异常", 502);
    }

    const material = await prisma.material.update({
      where: { id: placeholder.id },
      data: { url: result.url, storageKey },
    });

    return ok({ material }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
