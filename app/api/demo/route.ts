import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { demoRequestSchema } from "@/lib/validations";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit({
      key: `demo:${ip}`,
      limit: 5,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("太频繁了，请稍后再试", 429);

    const body = await req.json();
    const data = demoRequestSchema.parse(body);

    const dr = await prisma.demoRequest.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        company: data.company,
        message: data.message,
      },
    });

    return ok({ id: dr.id });
  } catch (err) {
    return handleError(err);
  }
}
