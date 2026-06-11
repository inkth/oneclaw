import { Header } from "@/components/Header";
import { HomeHero } from "@/components/home/HomeHero";
import { Chain } from "@/components/home/Chain";
import { Team } from "@/components/home/Team";
import { FinalCTA } from "@/components/home/FinalCTA";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/ui/Reveal";

/* 首页即产品：首屏直接给出工作台的「一句话派活」体验，
   随后只讲两件事——链路怎么接力、团队是谁，深色 CTA 收尾。 */
export default function Home() {
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
