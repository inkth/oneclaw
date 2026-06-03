import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { subscribeSchema } from "@/lib/validations";
import { ok, fail, handleError } from "@/lib/api";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit({
      key: `subscribe:${ip}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!rl.success) return fail("太频繁了，请稍后再试", 429);

    const body = await req.json();
    const data = subscribeSchema.parse(body);
    const email = data.email.toLowerCase();

    try {
      const sub = await prisma.newsletterSubscription.create({
        data: { email, source: data.source },
      });
      return ok({ id: sub.id, email: sub.email });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return fail("你已经订阅过了", 409);
      }
      throw e;
    }
  } catch (err) {
    return handleError(err);
  }
}
