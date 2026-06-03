import { PrismaClient, Prisma } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const nullCnt = await p.discoverProduct.count({ where: { coverUrls: { equals: Prisma.DbNull } } });
  const total = await p.discoverProduct.count();
  console.log(`covers filled: ${total - nullCnt} / ${total} (NULL: ${nullCnt})`);
  await p.$disconnect();
}
main();
