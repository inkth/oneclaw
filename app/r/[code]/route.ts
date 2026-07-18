import { NextResponse, type NextRequest } from "next/server";

const API_BASE = process.env.GO_API_INTERNAL_URL ?? "http://localhost:8082";
const REFERRAL_COOKIE = process.env.REFERRAL_COOKIE_NAME ?? "oc_ref";
const SESSION_COOKIE = process.env.COOKIE_NAME ?? "oc_session";

type VisitResult = {
  valid: boolean;
  inviteCode?: string;
  token?: string;
  expiresAt?: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const publicOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.url;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const existingToken = request.cookies.get(REFERRAL_COOKIE)?.value ?? "";
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  // 已登录用户不是新客，不计推广访问，也不保留归因 Cookie。
  if (hasSession) {
    const response = NextResponse.redirect(new URL("/app", publicOrigin), 302);
    response.cookies.set({
      name: REFERRAL_COOKIE,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  let result: VisitResult | null = null;
  try {
    const response = await fetch(`${API_BASE}/api/v1/agency/referral/visit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
      },
      body: JSON.stringify({
        inviteCode: code,
        existingToken,
        landingPath: `${request.nextUrl.pathname}${request.nextUrl.search}`,
        utmSource: request.nextUrl.searchParams.get("utm_source") ?? "",
        utmMedium: request.nextUrl.searchParams.get("utm_medium") ?? "",
        utmCampaign: request.nextUrl.searchParams.get("utm_campaign") ?? "",
        referer: request.headers.get("referer") ?? "",
        userAgent: request.headers.get("user-agent") ?? "",
        clientIp: forwardedFor || request.headers.get("x-real-ip") || "",
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.ok) {
      result = payload.data as VisitResult;
    }
  } catch {
    // 跟踪异常不能阻断正常登录。
  }

  const targetUrl = new URL("/login", publicOrigin);
  targetUrl.searchParams.set("callbackUrl", "/app");
  if (result?.valid && result.inviteCode) {
    targetUrl.searchParams.set("invite", result.inviteCode);
  }

  const response = NextResponse.redirect(targetUrl, 302);
  if (result?.valid && result.token) {
    response.cookies.set({
      name: REFERRAL_COOKIE,
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt ? new Date(result.expiresAt) : undefined,
      priority: "high",
    });
  }
  return response;
}
