/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const products = [
  {
    title: "USB 充电便携榨汁杯 380ml",
    category: "厨房小电",
    emoji: "🥤",
    priceCents: 2499,
    costCents: 620,
    marginPct: 62,
    roiScore: 94,
    monthlySales: 12400,
    trendDelta: 218,
    status: "RECOMMENDED" as const,
    note: "TikTok 相关话题 14d 播放 +218%，欧美夏季消费季前的高增长品类。",
  },
  {
    title: "智能宠物饮水机 1.5L",
    category: "宠物用品",
    emoji: "🐾",
    priceCents: 3999,
    costCents: 1180,
    marginPct: 55,
    roiScore: 88,
    monthlySales: 9100,
    trendDelta: 132,
    status: "RECOMMENDED" as const,
    note: "Reddit 宠物社区好评多，复购率高。",
  },
  {
    title: "多功能露营折叠灯",
    category: "户外装备",
    emoji: "🏕️",
    priceCents: 1899,
    costCents: 540,
    marginPct: 51,
    roiScore: 81,
    monthlySales: 7600,
    trendDelta: 64,
    status: "EVALUATING" as const,
    note: "野营旺季临近，需注意运输尺寸优化。",
  },
  {
    title: "极简硅胶手机壳",
    category: "数码配件",
    emoji: "📱",
    priceCents: 1299,
    costCents: 380,
    marginPct: 48,
    roiScore: 62,
    monthlySales: 4200,
    trendDelta: -8,
    status: "EVALUATING" as const,
    note: "竞品过多，价格战风险。",
  },
];

const videos = [
  {
    title: "便携榨汁杯 Unboxing",
    style: "UNBOXING" as const,
    durationSec: 15,
    views: 98300,
    likes: 12100,
    saves: 1200,
    revenueCents: 420000,
  },
  {
    title: "VS 手摇榨汁杯",
    style: "COMPARISON" as const,
    durationSec: 18,
    views: 62400,
    likes: 7800,
    saves: 780,
    revenueCents: 260000,
  },
  {
    title: "户外野餐用 1 杯",
    style: "SCENE" as const,
    durationSec: 14,
    views: 44700,
    likes: 5200,
    saves: 520,
    revenueCents: 180000,
  },
  {
    title: "21 天早 C 晚 A",
    style: "BEFORE_AFTER" as const,
    durationSec: 16,
    views: 31000,
    likes: 4400,
    saves: 440,
    revenueCents: 120000,
  },
];

async function main() {
  const email = "demo@oneclaw.ai";
  const phone = "13800000000"; // demo 用，dev fallback 下登录看 console 拿验证码
  const passwordHash = await bcrypt.hash("demopass1234", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { phone, phoneVerified: new Date() },
    create: {
      email,
      phone,
      phoneVerified: new Date(),
      name: "OneClaw Demo",
      passwordHash,
    },
  });

  let workspace = await prisma.workspace.findFirst({
    where: { ownerId: user.id },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Demo 工作台",
        slug: `demo-${Date.now().toString(36)}`,
        ownerId: user.id,
        plan: "PRO",
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
    });
  }

  const existingProducts = await prisma.product.count({
    where: { workspaceId: workspace.id },
  });
  let topProductId: string | null = null;
  if (existingProducts === 0) {
    const created = await prisma.$transaction(
      products.map((p) =>
        prisma.product.create({ data: { ...p, workspaceId: workspace!.id } }),
      ),
    );
    topProductId = created[0].id;
  } else {
    const top = await prisma.product.findFirst({
      where: { workspaceId: workspace.id, status: "RECOMMENDED" },
      orderBy: { roiScore: "desc" },
    });
    topProductId = top?.id ?? null;
  }

  const existingVideos = await prisma.video.count({
    where: { workspaceId: workspace.id },
  });
  if (existingVideos === 0) {
    await prisma.$transaction(
      videos.map((v) =>
        prisma.video.create({
          data: { ...v, workspaceId: workspace!.id, productId: topProductId },
        }),
      ),
    );
  }

  console.log("✅ Seed complete");
  console.log(`   Demo phone: ${phone}（用 /login，验证码看 dev terminal）`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
