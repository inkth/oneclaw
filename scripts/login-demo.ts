/**
 * 工具：直接给 demo phone (13800000000) 在 DB 注入一条已知 OTP，
 * 然后让 preview 浏览器经 phone-otp credentials provider 完成登录。
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const phone = "13800000000";
  const code = "888888";
  await prisma.phoneVerificationCode.updateMany({
    where: { phone, usedAt: null },
    data: { expires: new Date() },
  });
  await prisma.phoneVerificationCode.create({
    data: {
      phone,
      codeHash: crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex"),
      expires: new Date(Date.now() + 5 * 60_000),
    },
  });
  console.log(JSON.stringify({ phone, code }));
}
main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
