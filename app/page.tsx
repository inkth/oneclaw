import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { PainPoints } from "@/components/PainPoints";
import { Workflow } from "@/components/Workflow";
import { ProductDiscovery } from "@/components/ProductDiscovery";
import { ContentCreation } from "@/components/ContentCreation";
import { Agents } from "@/components/Agents";
import { Partners } from "@/components/Partners";
import { CTA } from "@/components/CTA";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/ui/Reveal";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        <Hero />
        {/* 滚动进场：下半屏区块淡入上浮，营造高级感节奏 */}
        <Reveal><PainPoints /></Reveal>
        <Reveal><Workflow /></Reveal>
        <Reveal><ProductDiscovery /></Reveal>
        <Reveal><ContentCreation /></Reveal>
        <Reveal><Agents /></Reveal>
        <Reveal><Partners /></Reveal>
        <Reveal><CTA /></Reveal>
      </main>
      <Footer />
    </>
  );
}
