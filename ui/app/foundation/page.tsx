import SectionPage from "@/components/SectionPage";
import { sections } from "@/data/navigation";
import { readFolder } from "@/utils/readFolder";

const section = sections.find((s) => s.id === "foundation")!;

export default function FoundationPage() {
  const items = readFolder(section.folderPath);
  return <SectionPage section={section} items={items} />;
}
