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
// ── HOW A MOBILE LITE ISSUE IS RECOGNISED ───────────────────────────────────
// By ONE fact, written by the registration itself:
//
//     extra_data.mobileSource === "warehouse-mobile-lite"
//
// Deliberately NOT by the Raised By code, the staff code, the Issue ID prefix,
// or the reporter's display name. Those describe WHO raised the Issue, which is
// a different question from WHERE it came from — and getting the two confused is
// precisely the bug this fixes: TU-001 was raised from Warehouse Mobile Lite by
// TestUser, so a "WH"-prefix test called it a desktop Issue and dumped its
// timeline as raw JSON. `mobileSource` is stamped by the server on every Mobile
// Lite registration and by nothing else, so it answers the actual question for
// every raiser, present and future.
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
  /** `number` is this recording's 1-based position AMONG THE RECORDINGS, so a
   *  report with three of them reads "Voice Note 1 / 2 / 3" however they are
   *  interleaved with photos and text. It is a display ordinal, not an id. */
  | { kind: "voice"; url: string; number: number }
  /** A future entry kind this build does not know. Rendered as a neutral line,
   *  never as raw JSON. */
  | { kind: "unsupported" };

/** The keys Mobile Lite writes. Mirror MOBILE_TIMELINE_KEY / MOBILE_SOURCE_KEY /
 *  MOBILE_SOURCE_VALUE, kept here so this module stays free of any
 *  mobile/server import. tests/mobileEvidence.test.ts pins them together. */
export const MOBILE_TIMELINE_KEY = "mobileTimeline";
export const MOBILE_SOURCE_KEY = "mobileSource";
export const MOBILE_SOURCE_VALUE = "warehouse-mobile-lite";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Only an absolute https URL is ever handed to the page. */
function readHttpsUrl(value: unknown): string | null {
  const text = readString(value);
  return text && /^https:\/\//i.test(text) ? text : null;
}

/**
 * True when this Issue was registered by Warehouse Mobile Lite.
 *
 * The ONE detection rule — see the header. Anything that is not the exact
 * stored marker is false, including a near-miss value, so nothing outside
 * Mobile Lite can opt itself into this renderer.
 */
export function isWarehouseMobileLite(extraData: unknown): boolean {
  if (!extraData || typeof extraData !== "object" || Array.isArray(extraData)) {
    return false;
  }
  return (extraData as Record<string, unknown>)[MOBILE_SOURCE_KEY] === MOBILE_SOURCE_VALUE;
}

/**
 * Reads extra_data.mobileTimeline into a renderable list.
 *
 * Returns null unless the Issue is BOTH a Mobile Lite Issue (by the metadata
 * marker above) AND carries a timeline. So:
 *
 *   desktop / historical Issue      -> null, page unchanged
 *   Stage 1 Mobile Lite (no timeline)-> null, and its photos and recording keep
 *                                      rendering through the existing gallery
 *                                      and audio sections exactly as they do
 *                                      today — nothing about WH-001 changes
 *   Stage 2+ Mobile Lite            -> the readable section
 *
 * The stored ORDER is preserved exactly: entries are never regrouped by kind.
 */
export function readMobileEvidence(extraData: unknown): MobileEvidenceItem[] | null {
  if (!isWarehouseMobileLite(extraData)) {
    return null;
  }
  const raw = (extraData as Record<string, unknown>)[MOBILE_TIMELINE_KEY];
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const items: MobileEvidenceItem[] = [];
  // Counts only the recordings that actually render, so a malformed entry in
  // the middle cannot make the visible numbering skip a value.
  let voiceNumber = 0;
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
      if (url) {
        voiceNumber += 1;
        items.push({ kind: "voice", url, number: voiceNumber });
      } else {
        items.push({ kind: "unsupported" });
      }
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
