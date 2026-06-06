import { NextResponse, type NextRequest } from "next/server";

// 仅按 oc_session Cookie 是否存在做快速 gate;权威校验交给 (app) 布局的 getMe()。
// 边缘运行时不持有 JWT secret,故不验签。
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("oc_session");
  const { pathname } = req.nextUrl;

  // 游客可自由逛 /app(浏览态);「生成/导入/收藏」等动作由页面内登录浮层拦截。
  // 已登录访问 /login 跳回工作台。
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/app", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login"],
};
