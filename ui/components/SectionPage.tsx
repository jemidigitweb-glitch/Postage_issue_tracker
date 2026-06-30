import Link from "next/link";
import { ArrowLeft, ChevronRight, Folder, FileText } from "lucide-react";
import { iconMap } from "@/utils/iconMap";
import Footer from "@/components/Footer";
import type { Section } from "@/data/navigation";
import type { FolderItem } from "@/utils/readFolder";

interface SectionPageProps {
  section: Section;
  items: FolderItem[];
}

export default function SectionPage({ section, items }: SectionPageProps) {
  const { title, icon, pageDescription } = section;
  const Icon = iconMap[icon] ?? iconMap.BookOpen;

  return (
    <div className="min-h-screen bg-aios-bg flex flex-col">
      <div className="flex-1 w-full max-w-4xl mx-auto px-6 py-12 flex flex-col">

        {/* Back navigation */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-aios-muted hover:text-aios-primary transition-colors mb-12 self-start group"
        >
          <ArrowLeft
            size={15}
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to Home
        </Link>

        {/* Page title */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-aios-surface border border-aios-border flex items-center justify-center shrink-0">
            <Icon size={26} className="text-aios-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-aios-primary tracking-tight">
            {title}
          </h1>
        </div>

        {/* Description */}
        <p className="text-aios-muted text-base leading-relaxed mb-12 max-w-2xl">
          {pageDescription}
        </p>

        {/* Content cards */}
        <div className="grid sm:grid-cols-2 gap-5">

          {/* Contents — real folder data */}
          <div className="bg-aios-surface border border-aios-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-aios-border">
                Contents
              </h2>
              {items.length > 0 && (
                <span className="text-xs text-aios-border font-mono">
                  {items.length} item{items.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {items.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {items.map((item) => {
                  const isMd =
                    item.type === "file" &&
                    item.name.toLowerCase().endsWith(".md");

                  const docPath =
                    section.folderPath === "."
                      ? item.name
                      : `${section.folderPath}/${item.name}`;

                  if (isMd) {
                    return (
                      <li key={item.name}>
                        <Link
                          href={`/document/${docPath}`}
                          className="flex items-center gap-3 text-sm text-aios-muted hover:text-aios-primary transition-colors group"
                        >
                          <FileText
                            size={14}
                            className="text-aios-accent shrink-0"
                          />
                          <span className="truncate flex-1">{item.name}</span>
                          <ChevronRight
                            size={12}
                            className="text-aios-border group-hover:text-aios-accent transition-colors shrink-0"
                          />
                        </Link>
                      </li>
                    );
                  }

                  if (item.type === "folder") {
                    const folderSlug =
                      section.folderPath === "."
                        ? item.name
                        : `${section.folderPath}/${item.name}`;
                    return (
                      <li key={item.name}>
                        <Link
                          href={`/folder/${folderSlug}`}
                          className="flex items-center gap-3 text-sm text-aios-muted hover:text-aios-primary transition-colors group"
                        >
                          <Folder
                            size={14}
                            className="text-aios-accent shrink-0"
                          />
                          <span className="truncate flex-1">{item.name}</span>
                          <ChevronRight
                            size={12}
                            className="text-aios-border group-hover:text-aios-accent transition-colors shrink-0"
                          />
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={item.name}
                      className="flex items-center gap-3 text-sm text-aios-muted"
                    >
                      <FileText
                        size={14}
                        className="text-aios-border shrink-0"
                      />
                      <span className="truncate">{item.name}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-aios-border">No items found.</p>
            )}
          </div>

          {/* Status card */}
          <div className="bg-aios-surface border border-aios-border rounded-2xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-aios-border mb-5">
              Current Status
            </h2>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl">✅</span>
              <span className="text-aios-primary font-semibold">
                Phase 4 — Active
              </span>
            </div>
            <p className="text-sm text-aios-muted leading-relaxed">
              Click any <span className="text-aios-accent font-mono text-xs">.md</span> file to open
              it as a formatted document.
            </p>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
