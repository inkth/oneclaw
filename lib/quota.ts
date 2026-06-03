import { prisma } from "@/lib/db";
import type { Plan } from "@prisma/client";

export type QuotaSnapshot = {
  plan: Plan;
  period: { start: Date; end: Date };
  tasks: { used: number; limit: number | null; remaining: number | null };
  videos: { used: number; limit: number | null; remaining: number | null };
};

const PLAN_LIMITS: Record<
  Plan,
  { tasks: number | null; videos: number | null }
> = {
  FREE: { tasks: 10, videos: 4 },
  PRO: { tasks: 200, videos: 80 },
  TEAM: { tasks: null, videos: null }, // unlimited
};

function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

export async function getWorkspaceQuota(
  workspaceId: string,
): Promise<QuotaSnapshot> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  const plan: Plan = ws?.plan ?? "FREE";
  const period = monthRange();

  const [tasksUsed, videosUsed] = await Promise.all([
    prisma.agentTask.count({
      where: {
        workspaceId,
        createdAt: { gte: period.start, lt: period.end },
      },
    }),
    prisma.video.count({
      where: {
        workspaceId,
        createdAt: { gte: period.start, lt: period.end },
        falRequestId: { not: null },
      },
    }),
  ]);

  const limits = PLAN_LIMITS[plan];
  return {
    plan,
    period,
    tasks: {
      used: tasksUsed,
      limit: limits.tasks,
      remaining: limits.tasks == null ? null : Math.max(0, limits.tasks - tasksUsed),
    },
    videos: {
      used: videosUsed,
      limit: limits.videos,
      remaining: limits.videos == null ? null : Math.max(0, limits.videos - videosUsed),
    },
  };
}

export type QuotaCheckResult =
  | { ok: true; quota: QuotaSnapshot }
  | { ok: false; quota: QuotaSnapshot; reason: string };

export async function assertCanDispatchTask(
  workspaceId: string,
): Promise<QuotaCheckResult> {
  const q = await getWorkspaceQuota(workspaceId);
  if (q.tasks.limit != null && q.tasks.used >= q.tasks.limit) {
    return {
      ok: false,
      quota: q,
      reason: `本月 Agent 任务额度已用尽（${q.tasks.used}/${q.tasks.limit}）。升级到 PRO 即可继续。`,
    };
  }
  return { ok: true, quota: q };
}

export async function assertCanGenerateVideo(
  workspaceId: string,
): Promise<QuotaCheckResult> {
  const q = await getWorkspaceQuota(workspaceId);
  if (q.videos.limit != null && q.videos.used >= q.videos.limit) {
    return {
      ok: false,
      quota: q,
      reason: `本月视频生成额度已用尽（${q.videos.used}/${q.videos.limit}）。升级或等下个周期。`,
    };
  }
  return { ok: true, quota: q };
}
