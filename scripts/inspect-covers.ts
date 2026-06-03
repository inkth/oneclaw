import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const r = await p.discoverProduct.findFirst({
    where: { externalId: "1729508370969629931" },
    select: { coverUrls: true },
  });
  const c = r?.coverUrls;
  if (Array.isArray(c) && c.length > 0) {
    const first = c[0] as { url: string; raw?: string; index?: number };
    console.log("count:", c.length);
    console.log("first url:", first.url.slice(0, 160) + "...");
    console.log("signed?:", first.url.includes("X-Tos-Signature"));
    console.log("kept raw?:", "raw" in first);
  } else {
    console.log("no covers");
  }
  await p.$disconnect();
}
main();
