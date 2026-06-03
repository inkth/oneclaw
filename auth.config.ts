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
      const onApp = pathname.startsWith("/app");
      const onAuthPage = pathname === "/login";

      if (onApp && !isLoggedIn) return false; // 触发跳转到 signIn
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
