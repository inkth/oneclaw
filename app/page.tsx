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

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        <Hero />
        <PainPoints />
        <Workflow />
        <ProductDiscovery />
        <ContentCreation />
        <Agents />
        <Partners />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
