import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { message, details } },
    { status },
  );
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("参数校验失败", 400, err.issues);
  }
  console.error("[api]", err);
  const message = err instanceof Error ? err.message : "Internal error";
  return fail(message, 500);
}
