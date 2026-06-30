import Link from "next/link";
import { ArrowLeft, ChevronRight, Folder, FileText } from "lucide-react";
import Footer from "@/components/Footer";
import { sections } from "@/data/navigation";
import type { FolderItem } from "@/utils/readFolder";

// Map folderPath → section href (excludes Foundation whose folderPath is ".")
const folderToSection: Record<string, string> = Object.fromEntries(
  sections
    .filter((s) => s.folderPath !== ".")
    .map((s) => [s.folderPath, s.href])
);

function formatName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Crumb {
  label: string;
  href: string | null;
}

function buildBreadcrumbs(slug: string[]): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];

  for (let i = 0; i < slug.length; i++) {
    const segment = slug[i];
    const isLast = i === slug.length - 1;

    if (isLast) {
      crumbs.push({ label: formatName(segment), href: null });
    } else if (i === 0 && folderToSection[segment]) {
      // First segment maps to a known section page
      crumbs.push({ label: formatName(segment), href: folderToSection[segment] });
    } else {
      const partial = slug.slice(0, i + 1).join("/");
      crumbs.push({ label: formatName(segment), href: `/folder/${partial}` });
    }
  }

  return crumbs;
}

interface FolderViewProps {
  slug: string[];
  items: FolderItem[];
}

export default function FolderView({ slug, items }: FolderViewProps) {
  const crumbs = buildBreadcrumbs(slug);
  const currentFolder = slug[slug.length - 1];

  // Back is one level up in breadcrumbs
  const backHref = crumbs[crumbs.length - 2]?.href ?? "/";

  return (
    <div className="min-h-screen bg-aios-bg flex flex-col">
      <div className="flex-1 w-full max-w-4xl mx-auto px-6 py-12 flex flex-col">

        {/* Back button */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-aios-muted hover:text-aios-primary transition-colors mb-8 self-start group"
        >
          <ArrowLeft
            size={15}
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back
        </Link>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm mb-8 flex-wrap">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight size={12} className="text-aios-border shrink-0 mx-0.5" />
              )}
              {crumb.href !== null ? (
                <Link
                  href={crumb.href}
                  className="text-aios-accent hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-aios-primary font-medium">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Folder header */}
        <div className="flex items-center gap-3 mb-2">
          <Folder size={28} className="text-aios-accent shrink-0" />
          <h1 className="text-3xl md:text-4xl font-bold text-aios-primary tracking-tight">
            {formatName(currentFolder)}
          </h1>
        </div>
        <p className="text-xs text-aios-border font-mono mb-10">
          {slug.join("/")}
        </p>

        {/* Items */}
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
                const childPath = [...slug, item.name].join("/");

                if (item.type === "folder") {
                  return (
                    <li key={item.name}>
                      <Link
                        href={`/folder/${childPath}`}
                        className="flex items-center gap-3 text-sm text-aios-muted hover:text-aios-primary transition-colors group"
                      >
                        <Folder size={14} className="text-aios-accent shrink-0" />
                        <span className="truncate flex-1">{item.name}</span>
                        <ChevronRight
                          size={12}
                          className="text-aios-border group-hover:text-aios-accent transition-colors shrink-0"
                        />
                      </Link>
                    </li>
                  );
                }

                if (isMd) {
                  return (
                    <li key={item.name}>
                      <Link
                        href={`/document/${childPath}`}
                        className="flex items-center gap-3 text-sm text-aios-muted hover:text-aios-primary transition-colors group"
                      >
                        <FileText size={14} className="text-aios-accent shrink-0" />
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
                    <FileText size={14} className="text-aios-border shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-aios-border">This folder is empty.</p>
          )}
        </div>

      </div>
      <Footer />
    </div>
  );
}
