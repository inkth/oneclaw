import { Header } from "@/components/Header";
import { HomeHero } from "@/components/home/HomeHero";
import { Chain } from "@/components/home/Chain";
import { Team } from "@/components/home/Team";
import { FinalCTA } from "@/components/home/FinalCTA";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/ui/Reveal";

export const metadata = { title: "发现猫 · 你的 AI 出海团队" };

/* 营销落地页：讲清「是什么 / 帮你赚什么」，留给还没被种草的陌生人发链接用。
   私域/社群用户走根路径 /(直接进工作台);这页通过直接链接触达。 */
export default function IntroPage() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        <HomeHero />
        <Reveal><Chain /></Reveal>
        <Reveal><Team /></Reveal>
        <Reveal><FinalCTA /></Reveal>
      </main>
      <Footer />
    </>
  );
}
