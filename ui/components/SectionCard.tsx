import Link from "next/link";
import { iconMap } from "@/utils/iconMap";
import type { Section } from "@/data/navigation";

export default function SectionCard({
  title,
  description,
  folder,
  icon,
  href,
}: Section) {
  const Icon = iconMap[icon] ?? iconMap.BookOpen;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-5 bg-aios-surface border border-aios-border rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 hover:border-slate-400 hover:shadow-2xl hover:shadow-black/30"
    >
      <div className="w-11 h-11 rounded-xl bg-aios-bg border border-aios-border flex items-center justify-center transition-colors group-hover:border-slate-500">
        <Icon size={20} className="text-aios-accent" />
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <h2 className="text-base font-semibold text-aios-primary leading-snug">
          {title}
        </h2>
        <p className="text-sm text-aios-muted leading-relaxed">
          {description}
        </p>
      </div>

      <div className="pt-4 border-t border-aios-border">
        <span className="text-xs font-mono text-aios-border transition-colors group-hover:text-aios-muted">
          {folder}
        </span>
      </div>
    </Link>
  );
}
