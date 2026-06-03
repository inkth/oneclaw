import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/db";
import { verifyCode, normalizePhone } from "@/lib/phoneverify";

const phoneCredentialsSchema = z.object({
  phone: z.string().min(11).max(20),
  code: z.string().min(4).max(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "phone-otp",
      name: "phone-otp",
      credentials: {
        phone: { label: "手机号", type: "tel" },
        code: { label: "验证码", type: "text" },
      },
      async authorize(credentials) {
        const parsed = phoneCredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { phone, code } = parsed.data;

        const verified = await verifyCode(phone, code);
        if (!verified.ok) return null;

        const normalized = verified.phone;

        // 找到或创建用户；首次验证视为通过手机验证
        const user = await prisma.$transaction(async (tx) => {
          const existing = await tx.user.findUnique({ where: { phone: normalized } });
          if (existing) {
            if (!existing.phoneVerified) {
              return tx.user.update({
                where: { id: existing.id },
                data: { phoneVerified: new Date() },
              });
            }
            return existing;
          }
          // 全新用户：建 user + 默认 workspace + membership
          const created = await tx.user.create({
            data: {
              phone: normalized,
              phoneVerified: new Date(),
              name: `用户${normalized.slice(-4)}`,
            },
          });
          const workspace = await tx.workspace.create({
            data: {
              name: "默认工作台",
              slug: `ws-${Date.now().toString(36)}-${created.id.slice(0, 6)}`,
              ownerId: created.id,
            },
          });
          await tx.membership.create({
            data: {
              userId: created.id,
              workspaceId: workspace.id,
              role: "OWNER",
            },
          });
          return created;
        });

        return {
          id: user.id,
          email: user.email ?? `${user.phone}@phone.oneclaw.ai`, // Auth.js type 兼容
          name: user.name,
          image: user.image,
          phone: user.phone,
        };
      },
    }),
  ],
});

export { normalizePhone };
