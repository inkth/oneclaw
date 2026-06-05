import type { NextAuthConfig } from "next-auth";

// 边缘运行时友好的最小配置 —— 不引用 Prisma（中间件用）
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const onAuthPage = pathname === "/login";

      // 所有页面对游客可见；需要账号的动作各页自行提示登录。
      // 已登录用户访问 /login 时直接送进 /app。
      if (onAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/app", request.nextUrl));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        // 手机号信息透传
        if ("phone" in user && user.phone) token.phone = user.phone as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = (token.email as string | null) ?? session.user.email;
        session.user.name = (token.name as string | null) ?? session.user.name;
        if (token.phone) session.user.phone = token.phone as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
};
