import Header from "@/components/Header";
import SectionCard from "@/components/SectionCard";
import Footer from "@/components/Footer";
import { sections } from "@/data/navigation";

export default function Home() {
  return (
    <div className="min-h-screen bg-aios-bg flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-aios-border mb-1">
            Knowledge Sections
          </p>
          <p className="text-sm text-aios-muted">
            Select a section to explore its contents
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {sections.map((section) => (
            <SectionCard key={section.id} {...section} />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
