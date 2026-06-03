import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const r = await prisma.discoverProduct.findMany({
    where: { region: "US" },
    select: { externalId: true, name: true, coverUrls: true },
    take: 5,
    orderBy: { totalSaleCnt: "desc" },
  });
  for (const x of r) {
    const cov = x.coverUrls;
    console.log(
      x.externalId,
      "covers:",
      cov == null ? "NULL" : Array.isArray(cov) ? `${(cov as unknown[]).length} items` : "non-array",
      "—",
      x.name.slice(0, 50),
    );
  }
  await prisma.$disconnect();
}

main();
