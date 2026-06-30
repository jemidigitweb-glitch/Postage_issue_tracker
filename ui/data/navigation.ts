export interface Section {
  id: string;
  title: string;
  description: string;
  folder: string;
  icon: string;
  href: string;
  pageDescription: string;
  folderPath: string;
}

export const sections: Section[] = [
  {
    id: "foundation",
    title: "Foundation",
    description: "Project overview, AIOS rules and governance.",
    folder: "CLAUDE.md",
    icon: "BookOpen",
    href: "/foundation",
    pageDescription:
      "Core AIOS foundation documents, project governance, operational rules, and the primary AIOS configuration file.",
    folderPath: ".",
  },
  {
    id: "context",
    title: "Context",
    description: "Business knowledge, procedures and operational understanding.",
    folder: "context/",
    icon: "FolderOpen",
    href: "/context",
    pageDescription:
      "Business knowledge, operational procedures, courier information, warehouse processes, and team structure documentation.",
    folderPath: "context",
  },
  {
    id: "skills",
    title: "Skills",
    description: "Daily operational guides and reusable knowledge.",
    folder: "skills/",
    icon: "Wrench",
    href: "/skills",
    pageDescription:
      "Daily operational skill guides covering booking, dispatch, tracking, returns, and reusable knowledge patterns.",
    folderPath: "skills",
  },
  {
    id: "intelligence-inbox",
    title: "Intelligence Inbox",
    description: "New operational findings waiting for investigation.",
    folder: "intelligence-inbox/",
    icon: "Inbox",
    href: "/intelligence-inbox",
    pageDescription:
      "Operational findings, daily issues, and document gaps waiting for investigation and formal documentation.",
    folderPath: "intelligence-inbox",
  },
  {
    id: "decisions",
    title: "Decisions",
    description: "Business decisions and future decision records.",
    folder: "decisions/",
    icon: "Scale",
    href: "/decisions",
    pageDescription:
      "Formal business decisions, decision log entries, and pending decisions awaiting approval.",
    folderPath: "decisions",
  },
  {
    id: "evidence",
    title: "Evidence",
    description: "Evidence packs and supporting documentation.",
    folder: "evidence/",
    icon: "FileCheck",
    href: "/evidence",
    pageDescription:
      "Supporting documentation, evidence packs, screenshots, and records that back operational decisions and validations.",
    folderPath: "evidence",
  },
  {
    id: "validation",
    title: "Validation",
    description: "Validation reports and quality checks.",
    folder: "validation/",
    icon: "ShieldCheck",
    href: "/validation",
    pageDescription:
      "Quality assurance reports, phase completion reports, and PASS/FAIL validation outputs.",
    folderPath: "validation",
  },
  {
    id: "handover",
    title: "Handover",
    description: "Session continuity and project handover documentation.",
    folder: "handover/",
    icon: "Handshake",
    href: "/handover",
    pageDescription:
      "Knowledge continuity between work sessions, next tasks, and pending items for the next session.",
    folderPath: "handover",
  },
];
