import SectionPage from "@/components/SectionPage";
import { sections } from "@/data/navigation";
import { readFolder } from "@/utils/readFolder";

const section = sections.find((s) => s.id === "intelligence-inbox")!;

export default function IntelligenceInboxPage() {
  const items = readFolder(section.folderPath);
  return <SectionPage section={section} items={items} />;
}
