import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  // 清掉旧的（不可显的 echosell 原文）coverUrls，让 enrich 重新跑
  const res = await p.discoverProduct.updateMany({
    where: { provider: "echotik" },
    data: { coverUrls: undefined as never }, // 写 null 走 DB NULL
  });
  // updateMany 不允许设 JSON 为 null 简便地；用 raw 改
  await p.$executeRaw`UPDATE "DiscoverProduct" SET "coverUrls" = NULL WHERE provider = 'echotik'`;
  console.log(`cleared coverUrls on ${res.count} rows (force enrich next cron)`);
  await p.$disconnect();
}
main();
