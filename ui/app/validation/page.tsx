import SectionPage from "@/components/SectionPage";
import { sections } from "@/data/navigation";
import { readFolder } from "@/utils/readFolder";

const section = sections.find((s) => s.id === "validation")!;

export default function ValidationPage() {
  const items = readFolder(section.folderPath);
  return <SectionPage section={section} items={items} />;
}
