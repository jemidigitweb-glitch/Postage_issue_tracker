import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { readMarkdown } from "@/utils/readMarkdown";
import MarkdownViewer from "@/components/MarkdownViewer";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

function getBackHref(slug: string[]): string {
  if (slug.length === 1) return "/foundation";          // root file → Foundation
  if (slug.length === 2) return `/${slug[0]}`;          // direct section file → section page
  return `/folder/${slug.slice(0, -1).join("/")}`;      // nested file → parent folder
}

function getTitle(slug: string[]): string {
  const filename = slug[slug.length - 1];
  return filename
    .replace(/\.md$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const content = readMarkdown(slug);

  if (content === null) notFound();

  const backHref = getBackHref(slug);
  const title = getTitle(slug);
  const filePath = slug.join("/");

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col">
      <div className="flex-1 w-full max-w-4xl mx-auto px-6 py-12 flex flex-col">

        {/* Back button */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-[#CBD5E1] hover:text-[#F8FAFC] transition-colors mb-10 self-start group"
        >
          <ArrowLeft
            size={15}
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back
        </Link>

        {/* Document header */}
        <div className="mb-10 pb-8 border-b border-[#334155]">
          <h1 className="text-3xl md:text-4xl font-bold text-[#F8FAFC] tracking-tight mb-2">
            {title}
          </h1>
          <p className="text-xs text-[#475569] font-mono">{filePath}</p>
        </div>

        {/* Markdown content */}
        <MarkdownViewer content={content} />

      </div>
      <Footer />
    </div>
  );
}
