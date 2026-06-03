import { PrismaClient, Prisma } from "@prisma/client";
import { getProductDetailBatch, parseProductCovers } from "../lib/echotik/client";

const prisma = new PrismaClient();

async function main() {
  // 直接看 query: 有几条 coverUrls=NULL
  const nullCount = await prisma.discoverProduct.count({
    where: { region: "US", coverUrls: { equals: Prisma.DbNull } },
  });
  console.log("[1] US 区域 coverUrls=DbNull 数量:", nullCount);

  // 拿 5 个 externalId
  const sample = await prisma.discoverProduct.findMany({
    where: { region: "US", coverUrls: { equals: Prisma.DbNull } },
    select: { id: true, externalId: true, name: true },
    take: 5,
  });
  console.log("[2] sample externalIds:", sample.map((s) => s.externalId).join(","));

  // 调 detail batch
  const ids = sample.map((s) => s.externalId);
  console.log("[3] calling getProductDetailBatch…");
  const details = await getProductDetailBatch(ids, "US");
  console.log("[4] got", details.length, "details");

  for (const d of details) {
    const covers = parseProductCovers((d as { cover_url: string }).cover_url);
    console.log(`    ${d.product_id}: cover_url len=${(d as { cover_url: string }).cover_url?.length ?? 0}, parsed=${covers.length}`);
    if (covers.length > 0) {
      const local = sample.find((s) => s.externalId === d.product_id);
      if (local) {
        await prisma.discoverProduct.update({
          where: { id: local.id },
          data: { coverUrls: covers as unknown as Prisma.InputJsonValue },
        });
        console.log(`      ✓ updated ${local.id}`);
      }
    }
  }

  // 重新查
  const after = await prisma.discoverProduct.findMany({
    where: { region: "US", externalId: { in: ids } },
    select: { externalId: true, coverUrls: true },
  });
  console.log("[5] after update:");
  for (const a of after) {
    const c = a.coverUrls;
    console.log(
      `    ${a.externalId}: covers=${c == null ? "NULL" : Array.isArray(c) ? (c as unknown[]).length : "?"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
