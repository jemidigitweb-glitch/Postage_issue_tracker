// PURE reader for extra_data.mobileTimeline — the Warehouse Mobile Stage 2
// evidence, turned into something a manager can read.
//
// DELIBERATELY has no `server-only` import, no `next/*` import and no network
// or database import — same discipline as the rest of lib/access/*, so every
// rule is directly unit-testable (tests/mobileEvidence.test.ts) without a
// request context, a Cloudinary account, or a browser.
//
// ── DISPLAY ONLY ────────────────────────────────────────────────────────────
// Nothing here writes. The stored shape is untouched: this reads what Mobile
// Lite already wrote (lib/mobile/mobileRegistration.ts buildMobileTimelineExtraData)
// and hands the Super Admin's page a narrow, safe view of it. The Issue's
// `images`, `attachments`, `issue_description`, `mobileSubmissionId` and
// `mobileSource` are all unchanged and still stored exactly as before.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────
// `mobileTimeline` is a JSON array. The detail page's generic "Additional
// details" renderer stringifies any non-primitive value, so a manager opening a
// Mobile Lite Issue was shown a raw JSON dump complete with internal UUIDs.
// Correct data, unreadable presentation.
//
// ── DEFENSIVE BY CONSTRUCTION ───────────────────────────────────────────────
// extra_data is free-form JSONB. Every field below is checked before it is
// used, an entry of an unrecognised kind becomes a neutral "unsupported"
// placeholder rather than an exception, and anything that is not an array at
// all yields null so the section simply does not render.

/** What the page may render for one stored entry. Internal ids never appear. */
export type MobileEvidenceItem =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; caption: string | null }
  | { kind: "voice"; url: string }
  /** A future entry kind this build does not know. Rendered as a neutral line,
   *  never as raw JSON. */
  | { kind: "unsupported" };

/** The key Mobile Lite writes. Mirrors MOBILE_TIMELINE_KEY, kept here so this
 *  module stays free of any mobile/server import. */
export const MOBILE_TIMELINE_KEY = "mobileTimeline";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Only an absolute https URL is ever handed to the page. */
function readHttpsUrl(value: unknown): string | null {
  const text = readString(value);
  return text && /^https:\/\//i.test(text) ? text : null;
}

/**
 * Reads extra_data.mobileTimeline into a renderable list.
 *
 * Returns null when the Issue has no timeline at all — a Stage 1 Mobile Lite
 * Issue, a desktop Issue, or any historical row — so the caller renders no
 * section and every existing Issue keeps exactly the page it had.
 *
 * The stored ORDER is preserved exactly: entries are never regrouped by kind.
 */
export function readMobileEvidence(extraData: unknown): MobileEvidenceItem[] | null {
  if (!extraData || typeof extraData !== "object" || Array.isArray(extraData)) {
    return null;
  }
  const raw = (extraData as Record<string, unknown>)[MOBILE_TIMELINE_KEY];
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const items: MobileEvidenceItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      items.push({ kind: "unsupported" });
      continue;
    }
    const record = entry as Record<string, unknown>;

    if (record.kind === "text") {
      const text = readString(record.text);
      // An empty text entry carries nothing a manager could read.
      items.push(text ? { kind: "text", text } : { kind: "unsupported" });
      continue;
    }

    if (record.kind === "image") {
      const url = readHttpsUrl(record.url);
      items.push(
        url ? { kind: "image", url, caption: readString(record.caption) } : { kind: "unsupported" }
      );
      continue;
    }

    if (record.kind === "voice") {
      const url = readHttpsUrl(record.url);
      items.push(url ? { kind: "voice", url } : { kind: "unsupported" });
      continue;
    }

    items.push({ kind: "unsupported" });
  }

  return items;
}

/** True when the evidence carries at least one thing worth showing — so a
 *  timeline of nothing but unreadable entries does not produce an empty card. */
export function hasRenderableEvidence(items: MobileEvidenceItem[] | null): boolean {
  return Boolean(items?.some((item) => item.kind !== "unsupported"));
}
