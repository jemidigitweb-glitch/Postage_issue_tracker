import { notFound } from "next/navigation";
import { isFolderReadable, readFolder } from "@/utils/readFolder";
import FolderView from "@/components/FolderView";

export const dynamic = "force-dynamic";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const relPath = slug.join("/");

  if (!isFolderReadable(relPath)) notFound();

  const items = readFolder(relPath);

  return <FolderView slug={slug} items={items} />;
}
