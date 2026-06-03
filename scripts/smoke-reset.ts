/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { generateToken } from "../lib/tokens";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@oneclaw.ai";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("demo user not found, run db:seed first");

  // 1. 创建一个合法 token，模拟邮件已发出的状态
  const { plain, hash } = generateToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expires: new Date(Date.now() + 30 * 60_000),
    },
  });
  console.log("[1] inserted PasswordResetToken (hash starts):", hash.slice(0, 16));

  // 2. 用错误密码登录确认现状（应失败）—— 在 reset 之前先记下原 hash
  const beforeHash = user.passwordHash;
  if (!beforeHash) throw new Error("user has no passwordHash");

  // 3. 调用 /api/auth/reset-password 接口
  const newPassword = "NewSecret2026!";
  const res = await fetch("http://localhost:3000/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: plain, newPassword }),
  });
  const json = await res.json();
  console.log("[2] reset response:", res.status, json);
  if (!res.ok) throw new Error("reset failed");

  // 4. 验证新密码对得上
  const userAfter = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(newPassword, userAfter!.passwordHash!);
  console.log("[3] new password matches:", ok);
  if (!ok) throw new Error("password did not update");

  // 5. token 应被标记为 used
  const usedToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hash },
  });
  console.log("[4] token usedAt:", usedToken?.usedAt);

  // 6. 二次用同 token 应失败
  const res2 = await fetch("http://localhost:3000/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: plain, newPassword: "Whatever1234!" }),
  });
  const json2 = await res2.json();
  console.log("[5] reuse same token:", res2.status, json2.error?.message);

  // 7. 把密码改回 demopass1234 方便后续登录
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash("demopass1234", 10) },
  });
  console.log("[6] restored demo password");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
