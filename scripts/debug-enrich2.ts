import { enrichCoversIfMissing } from "../lib/echotik/cache";
import { PrismaClient } from "@prisma/client";

async function main() {
  // 直接调，看 stdout 报错
  await enrichCoversIfMissing(
    ["1729508370969629931", "1729448464509734958", "1729679758111249333"],
    "US",
  );
  // 检查结果
  const p = new PrismaClient();
  const r = await p.discoverProduct.findFirst({
    where: { externalId: "1729508370969629931" },
    select: { coverUrls: true },
  });
  const c = r?.coverUrls;
  if (Array.isArray(c) && c.length > 0) {
    const first = c[0] as { url: string };
    console.log("\n→ first url:", first.url.slice(0, 200));
    console.log("→ signed?:", first.url.includes("X-Tos-Signature"));
  }
  await p.$disconnect();
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
