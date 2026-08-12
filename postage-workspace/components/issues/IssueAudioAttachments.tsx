import {
  ASSIGNEE_VISIBLE_SOURCES,
  formatBytes,
  readAudioAttachments,
} from "@/lib/access/attachments";

// Audio evidence on the Issue detail page.
//
// A Server Component with no controls of its own: it renders stored metadata
// and a native <audio> player. Nothing here can change an Issue, so adding it
// to the shared detail view does not touch any workflow — which is what makes
// it safe for BOTH portals. The Super Admin sees the evidence they attached;
// an Assignee opening an Issue they own sees the evidence they need to solve
// it. Neither gains a new control.
//
// ── NO AUTOPLAY ─────────────────────────────────────────────────────────────
// `controls` without `autoPlay` and without `preload="auto"`. The browser
// fetches metadata only until the user presses play, so opening an Issue with
// several recordings does not start downloading — or playing — anything.
//
// ── SOURCE ──────────────────────────────────────────────────────────────────
// extra_data.attachments, filtered to type === "audio" and validated
// field-by-field by readAudioAttachments() rather than trusted. Historical
// Issues have no such key (0 of 145 at the time of writing), so this section
// simply does not render for them — the existing image gallery, which reads
// the separate extra_data.images key, is untouched either way.

function sourceLabel(source: string): string | null {
  if (source === "voice_recording") return "Voice recording";
  if (source === "historical") return "Historical evidence";
  return null;
}

export default function IssueAudioAttachments({
  extraData,
  /**
   * PORTAL SEPARATION. When true (the Super Admin detail page), every audio
   * attachment is shown, including the historical recordings imported from the
   * original source material. When false (the Assignee detail page), only the
   * Add-New-Issue sources are shown — preserving exactly the behaviour the
   * Assignee portal already had, and introducing no new historical-audio UI
   * there.
   *
   * The filter runs SERVER-SIDE inside readAudioAttachments, so an Assignee's
   * page is never even sent the historical URLs.
   */
  includeHistorical = false,
}: {
  extraData: Record<string, unknown>;
  includeHistorical?: boolean;
}) {
  const audio = readAudioAttachments(
    extraData.attachments,
    includeHistorical ? undefined : ASSIGNEE_VISIBLE_SOURCES
  );

  if (audio.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-5">
        Audio Attachments
      </h2>
      <ul className="flex flex-col gap-4">
        {audio.map((attachment, index) => {
          const label = sourceLabel(attachment.source);
          const size = formatBytes(attachment.bytes);
          return (
            <li
              key={`${attachment.url}-${index}`}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 p-4 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 break-all">
                  {attachment.original_name}
                </span>
                <span className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {label && (
                    <span className="rounded-md bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 font-medium">
                      {label}
                    </span>
                  )}
                  {size && <span className="tabular-nums">{size}</span>}
                </span>
              </div>

              {/* Native player. No autoPlay, and preload="metadata" so nothing
                  downloads in full until the user asks for it. */}
              <audio controls preload="metadata" src={attachment.url} className="w-full">
                Your browser cannot play this audio file.
              </audio>

              <div>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline"
                >
                  Open in new tab
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
