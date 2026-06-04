import { NextResponse, type NextRequest } from "next/server";

// 仅按 oc_session Cookie 是否存在做快速 gate;权威校验交给 (app) 布局的 getMe()。
// 边缘运行时不持有 JWT secret,故不验签。
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("oc_session");
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/app") && !hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/app", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login"],
};
