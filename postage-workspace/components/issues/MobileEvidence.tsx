import type { MobileEvidenceItem } from "@/lib/access/mobileEvidence";

// Warehouse Mobile Stage 2 evidence, rendered for a manager.
//
// ── DISPLAY ONLY ────────────────────────────────────────────────────────────
// Reads what lib/access/mobileEvidence.ts already validated and renders it.
// No fetch, no state, no control: this is a server component and it writes
// nothing. The stored extra_data is untouched.
//
// ── WHAT A MANAGER NEVER SEES ───────────────────────────────────────────────
// No JSON, no braces, no internal item ids, no Cloudinary public_id, no slot
// names and no resource-type metadata. The reader strips all of it before this
// component is reached, so there is nothing here to leak.
//
// Styling mirrors the rest of components/issues/*.tsx — the same rounded-xl
// card, the same uppercase section heading — so it reads as part of the Issue
// page rather than a debug panel.

const cardClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 p-4";
const labelClassName =
  "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2";

export default function MobileEvidence({ items }: { items: MobileEvidenceItem[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">
        Mobile Evidence
      </h2>

      {/* The stored order is the order the worker built the report in, and it
          is preserved exactly — entries are never regrouped by kind. */}
      <ol className="flex flex-col gap-4">
        {items.map((item, index) => (
          <li key={index} className={cardClassName}>
            {item.kind === "text" && (
              <>
                <p className={labelClassName}>
                  <span aria-hidden="true">📝</span>
                  Text
                </p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                  {item.text}
                </p>
              </>
            )}

            {item.kind === "image" && (
              <>
                <p className={labelClassName}>
                  <span aria-hidden="true">🖼️</span>
                  Photo
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open full photo"
                  className="group block w-fit rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500"
                >
                  {/* Plain <img>, not next/image: these are arbitrary remote
                      URLs stored per-issue, and next/image would require
                      whitelisting hosts in next.config.ts. Same choice the
                      existing gallery makes. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={`Warehouse mobile photo ${index + 1}`}
                    loading="lazy"
                    className="max-h-64 rounded-lg border border-neutral-200 dark:border-neutral-800 object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                </a>
                {/* Only when there is one. No placeholder is ever invented. */}
                {item.caption && (
                  <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                    Caption: {item.caption}
                  </p>
                )}
              </>
            )}

            {item.kind === "voice" && (
              <>
                {/* Numbered, because a report may carry several. The number is
                    the recording's position among the recordings — Voice Note 1
                    is the first thing the worker said. */}
                <p className={labelClassName}>
                  <span aria-hidden="true">🎤</span>
                  Voice Note {item.number}
                </p>
                {/* Each recording is its own independent player, with its own
                    source — playing one never touches another. */}
                <audio
                  controls
                  preload="none"
                  src={item.url}
                  aria-label={`Voice note ${item.number}`}
                  className="w-full max-w-md"
                >
                  Your browser cannot play this recording.
                </audio>
              </>
            )}

            {item.kind === "unsupported" && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Unsupported evidence item
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
