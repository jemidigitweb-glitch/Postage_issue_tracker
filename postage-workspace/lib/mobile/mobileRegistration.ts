import {
  MOBILE_MAX_PHOTOS,
  MOBILE_UPLOAD_FOLDER,
  MOBILE_UPLOAD_SLOTS,
  MOBILE_VOICE_SLOT,
  isAnyPhotoSlot,
  isMobileUploadSlot,
  isValidAttemptId,
  isValidSubmissionId,
  resourceTypeForSlot,
  type MobileUploadSlot,
} from "./mobileAccess";
import { MOBILE_MAX_PHOTO_BYTES, MOBILE_MAX_VOICE_BYTES } from "./mobileMedia";

// Warehouse Mobile Lite — PURE registration rules: what the server derives,
// and what it refuses to believe from the client.
//
// No `server-only`, no `next/*`, no database, no network — so every rule is
// directly unit-testable (tests/mobileRegistration.test.ts) without a request,
// a Cloudinary account, or PostgreSQL.
//
// ── THE CLIENT CONTROLS NOTHING THAT MATTERS ────────────────────────────────
// Raised By, Domain, Status, Issue ID, timestamps, Title and Description are
// all produced HERE or by the database. The registration action never reads a
// client value for any of them, so there is no field to tamper with.

/** The system reporter for every Mobile Lite Issue. The row is created by a
 *  Super Admin through the existing Add Staff page — never by this code, and
 *  never substituted for another staff code if it is missing. */
export const MOBILE_STAFF_CODE = "WH";

/** Approved canonical Domain. Lower case, matching every existing value. */
export const MOBILE_CATEGORY = "inventory";

/** STAGE 1 description. Retained for the legacy two-photo path and its tests;
 *  Stage 2 builds a description from what the worker actually wrote. */
export const MOBILE_DESCRIPTION =
  "Warehouse Mobile report. The attached voice recording is the primary issue evidence, accompanied by two evidence photos.";

/** Used only when a Stage 2 draft carries media but not one word of worker
 *  text or caption. Never overwrites real worker text. */
export const MOBILE_FALLBACK_DESCRIPTION = "Warehouse mobile evidence report.";

/** extra_data keys this feature writes. Kept as constants so the writer, the
 *  idempotency lookup and the hidden-metadata list cannot drift apart. */
export const MOBILE_SUBMISSION_KEY = "mobileSubmissionId";
export const MOBILE_SOURCE_KEY = "mobileSource";
export const MOBILE_SOURCE_VALUE = "warehouse-mobile-lite";

/**
 * Title, derived entirely on the server.
 *
 * Deliberately carries NO username: the login-free design means there is no
 * authenticated worker identity, and inventing one would be a fabrication on
 * an operational record. The timestamp is what distinguishes one report from
 * the next, keeping the Super Admin's Issue list scannable and sortable.
 */
export function buildMobileIssueTitle(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return `Warehouse report — ${stamp}`;
}

// ---------------------------------------------------------------------------
// Asset verification
// ---------------------------------------------------------------------------

/** What the client claims it uploaded. Every field is re-checked below; none
 *  is trusted as given. */
export interface SubmittedAsset {
  publicId: string;
  secureUrl: string;
  bytes: number;
  format: string;
  resourceType: string;
}

export type SubmittedAssets = Record<MobileUploadSlot, SubmittedAsset | null | undefined>;

export type AssetCheck = { ok: true } | { ok: false; error: string };

/** Formats Cloudinary reports for the containers this system accepts. */
const PHOTO_FORMATS = ["jpg", "jpeg"];
const VOICE_FORMATS = ["webm", "m4a", "mp4", "mp3", "wav", "ogg", "oga", "flac", "aac"];

/**
 * True when a public_id belongs to THIS submission's Mobile Lite namespace.
 *
 * Used both to validate what is being attached and to bound what may be
 * deleted during cleanup, so neither can ever reach another submission's
 * assets, a desktop upload, or a historical Issue's evidence.
 */
export function isAssetInSubmission(publicId: unknown, submissionId: string): boolean {
  if (typeof publicId !== "string" || !isValidSubmissionId(submissionId)) {
    return false;
  }
  return publicId.startsWith(`${MOBILE_UPLOAD_FOLDER}/${submissionId}/`);
}

/**
 * Verifies one asset against the slot it is claimed for.
 *
 * The public_id must be EXACTLY the shape this server composes —
 * `issue-tracker/mobile/<submissionId>/<slot>/<attemptId>` — with a valid
 * attempt UUID and no extra path segments. That single check is what stops a
 * caller attaching an arbitrary Cloudinary asset: anything outside the
 * namespace, from another submission, or under another slot fails before the
 * resource type, format or size are even considered.
 */
export function verifySubmittedAsset(
  slot: MobileUploadSlot,
  submissionId: string,
  asset: SubmittedAsset | null | undefined
): AssetCheck {
  if (!asset || typeof asset !== "object") {
    return { ok: false, error: `Missing ${slot}.` };
  }
  if (!isAssetInSubmission(asset.publicId, submissionId)) {
    return { ok: false, error: "Evidence does not belong to this report." };
  }

  const expectedPrefix = `${MOBILE_UPLOAD_FOLDER}/${submissionId}/`;
  const remainder = asset.publicId.slice(expectedPrefix.length).split("/");
  if (remainder.length !== 2) {
    return { ok: false, error: "Evidence path is not recognised." };
  }
  const [assetSlot, attemptId] = remainder;
  if (assetSlot !== slot) {
    return { ok: false, error: "Evidence does not match the expected slot." };
  }
  if (!isValidAttemptId(attemptId)) {
    return { ok: false, error: "Evidence path is not recognised." };
  }

  if (asset.resourceType !== resourceTypeForSlot(slot)) {
    return { ok: false, error: "Evidence type does not match the expected slot." };
  }

  const allowedFormats = slot === "voice" ? VOICE_FORMATS : PHOTO_FORMATS;
  const format = typeof asset.format === "string" ? asset.format.toLowerCase() : "";
  // An empty format is tolerated only for audio, where Cloudinary does not
  // always report one for a browser recording container.
  if (format && !allowedFormats.includes(format)) {
    return { ok: false, error: "Evidence format is not supported." };
  }
  if (!format && slot !== "voice") {
    return { ok: false, error: "Evidence format is not supported." };
  }

  const maxBytes = slot === "voice" ? MOBILE_MAX_VOICE_BYTES : MOBILE_MAX_PHOTO_BYTES;
  if (typeof asset.bytes !== "number" || !Number.isFinite(asset.bytes) || asset.bytes <= 0) {
    return { ok: false, error: "Evidence size could not be confirmed." };
  }
  if (asset.bytes > maxBytes) {
    return { ok: false, error: "Evidence is larger than the allowed size." };
  }

  if (typeof asset.secureUrl !== "string" || !/^https:\/\//i.test(asset.secureUrl)) {
    return { ok: false, error: "Evidence location is not recognised." };
  }

  return { ok: true };
}

/** All three slots must be present and valid — a Mobile Lite Issue is never
 *  created with partial evidence. */
export function verifySubmittedAssets(submissionId: string, assets: SubmittedAssets): AssetCheck {
  if (!isValidSubmissionId(submissionId)) {
    return { ok: false, error: "Invalid submission." };
  }
  for (const slot of MOBILE_UPLOAD_SLOTS) {
    const check = verifySubmittedAsset(slot, submissionId, assets[slot]);
    if (!check.ok) {
      return check;
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// extra_data
// ---------------------------------------------------------------------------

/** The legacy three-key image shape the existing gallery reads. */
export interface StoredImageEntry {
  url: string;
  public_id: string;
  original_name: string;
}

/** The richer entry the existing audio player and attachment reader use. */
export interface StoredAttachmentEntry {
  type: "image" | "audio";
  url: string;
  public_id: string;
  original_name: string;
  mime_type: string;
  source: "voice_recording" | "upload";
  bytes: number;
}

/**
 * Builds extra_data in EXACTLY the shapes the Web Issue Tracker already reads.
 *
 * `images[]` keeps the three-key legacy shape so the existing gallery renders
 * the photos unchanged; `attachments[]` carries all three assets, with the
 * recording marked `source: "voice_recording"` — which is inside
 * ASSIGNEE_VISIBLE_SOURCES, so both portals can play it.
 *
 * Only two Mobile Lite keys are added, and no worker identity is invented:
 * the login-free design has none.
 */
export function buildMobileExtraData(
  submissionId: string,
  assets: Record<MobileUploadSlot, SubmittedAsset>
): Record<string, unknown> {
  const images: StoredImageEntry[] = (["photo1", "photo2"] as const).map((slot, index) => ({
    url: assets[slot].secureUrl,
    public_id: assets[slot].publicId,
    original_name: `evidence-photo-${index + 1}.jpg`,
  }));

  const attachments: StoredAttachmentEntry[] = [
    {
      type: "audio",
      url: assets.voice.secureUrl,
      public_id: assets.voice.publicId,
      original_name: "voice-recording",
      mime_type: assets.voice.format ? `audio/${assets.voice.format}` : "",
      source: "voice_recording",
      bytes: assets.voice.bytes,
    },
    ...(["photo1", "photo2"] as const).map((slot, index) => ({
      type: "image" as const,
      url: assets[slot].secureUrl,
      public_id: assets[slot].publicId,
      original_name: `evidence-photo-${index + 1}.jpg`,
      mime_type: "image/jpeg",
      source: "upload" as const,
      bytes: assets[slot].bytes,
    })),
  ];

  return {
    images,
    attachments,
    [MOBILE_SUBMISSION_KEY]: submissionId,
    [MOBILE_SOURCE_KEY]: MOBILE_SOURCE_VALUE,
  };
}

// ---------------------------------------------------------------------------
// STAGE 2 — the ordered timeline contract
// ---------------------------------------------------------------------------
//
// Stage 1 accepted exactly three assets in a fixed record. Stage 2 accepts an
// ORDERED list, because the worker composes a report the way they would compose
// a message: some text, a photo with a caption, another line, a voice note.
//
// Everything below is PURE, so every rule is unit-tested without a request, a
// database, or Cloudinary. The Stage 1 functions above are untouched and still
// exported — legacy assets, legacy Issues and their tests keep working.
//
// WHAT THE CLIENT STILL CANNOT DECIDE: Raised By, Domain, Status, Issue ID,
// timestamps and Title. Stage 2 adds exactly two client-authored fields — the
// worker's own text and their own photo captions — and both are normalised and
// length-capped here before they reach the database.

/** At most one voice note per report, in every stage. */
export const MOBILE_MAX_VOICE_ITEMS = 1;
/** A generous cap that still bounds one request. 10 photos + 1 voice + text. */
export const MOBILE_MAX_TIMELINE_ITEMS = 40;
/** Per-item text caps. Long enough for a real report, short enough that a
 *  description cannot be used as bulk storage. */
export const MOBILE_MAX_TEXT_LENGTH = 2000;
export const MOBILE_MAX_CAPTION_LENGTH = 300;
/** Draft item ids are client-generated for ordering only. They never reach the
 *  database, but they are still shape-checked rather than trusted. */
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** extra_data key carrying the ordered Stage 2 timeline. Additive: nothing that
 *  already reads `images` or `attachments` is affected by its presence. */
export const MOBILE_TIMELINE_KEY = "mobileTimeline";

/** What the client submits for one timeline position. */
export type MobileTimelineInput =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "image"; slot: string; asset: SubmittedAsset; caption?: string | null }
  | { id: string; kind: "voice"; slot: string; asset: SubmittedAsset };

/** What survives verification — narrowed, normalised, and safe to store. */
export type VerifiedTimelineItem =
  | { id: string; kind: "text"; text: string }
  | {
      id: string;
      kind: "image";
      slot: MobileUploadSlot;
      asset: SubmittedAsset;
      caption: string | null;
    }
  | { id: string; kind: "voice"; slot: MobileUploadSlot; asset: SubmittedAsset };

export type TimelineCheck =
  | { ok: true; items: VerifiedTimelineItem[] }
  | { ok: false; error: string };

/**
 * Collapses whitespace and caps length. Returns "" for anything that is not a
 * non-empty string, so a whitespace-only message can never become an item.
 */
export function normaliseMobileText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const collapsed = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    // Trim each line, so an indented newline does not survive as ragged text.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    // At most one blank line between paragraphs.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return collapsed.slice(0, maxLength).trim();
}

/** A caption is optional: blank normalises to null rather than "". */
export function normaliseMobileCaption(value: unknown): string | null {
  const text = normaliseMobileText(value, MOBILE_MAX_CAPTION_LENGTH);
  return text.length > 0 ? text : null;
}

/**
 * Verifies a whole Stage 2 submission.
 *
 * ── THE RULES, ALL ENFORCED HERE ON THE SERVER ──────────────────────────────
 *   - the submission id is a UUID this server would have signed for
 *   - 1..40 items, each an object with a unique, shape-checked id
 *   - kind is exactly "text", "image" or "voice" — nothing else
 *   - text is normalised and must survive as non-empty
 *   - an image sits in a photo slot; a voice sits in the voice slot
 *   - at most 10 images and at most 1 voice
 *   - no two items claim the same slot
 *   - no two items carry the same Cloudinary asset
 *   - every asset passes the SAME per-asset check Stage 1 used: namespace,
 *     slot, attempt UUID, resource type, format, size and https URL
 *   - at least one meaningful item exists (guaranteed: every accepted item is
 *     either real text or a verified asset)
 *
 * The client's own validation is a convenience. This is the boundary.
 */
export function verifyMobileTimeline(submissionId: string, items: unknown): TimelineCheck {
  if (!isValidSubmissionId(submissionId)) {
    return { ok: false, error: "Invalid submission." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Add something to the report before registering." };
  }
  if (items.length > MOBILE_MAX_TIMELINE_ITEMS) {
    return { ok: false, error: "This report has too many items." };
  }

  const verified: VerifiedTimelineItem[] = [];
  const seenIds = new Set<string>();
  const seenSlots = new Set<string>();
  const seenAssets = new Set<string>();
  let images = 0;
  let voices = 0;

  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "This report could not be read." };
    }
    const item = raw as Record<string, unknown>;

    const id = item.id;
    if (typeof id !== "string" || !ITEM_ID_PATTERN.test(id)) {
      return { ok: false, error: "This report could not be read." };
    }
    if (seenIds.has(id)) {
      return { ok: false, error: "This report contains a duplicate entry." };
    }
    seenIds.add(id);

    if (item.kind === "text") {
      const text = normaliseMobileText(item.text, MOBILE_MAX_TEXT_LENGTH);
      if (text.length === 0) {
        return { ok: false, error: "A message cannot be empty." };
      }
      verified.push({ id, kind: "text", text });
      continue;
    }

    if (item.kind === "image" || item.kind === "voice") {
      const slot = item.slot;
      if (!isMobileUploadSlot(slot)) {
        return { ok: false, error: "Evidence does not match the expected slot." };
      }
      const wantsPhoto = item.kind === "image";
      if (wantsPhoto !== isAnyPhotoSlot(slot)) {
        return { ok: false, error: "Evidence does not match the expected slot." };
      }
      if (!wantsPhoto && slot !== MOBILE_VOICE_SLOT) {
        return { ok: false, error: "Evidence does not match the expected slot." };
      }
      if (seenSlots.has(slot)) {
        return { ok: false, error: "This report contains a duplicate entry." };
      }
      seenSlots.add(slot);

      const asset = item.asset as SubmittedAsset | undefined;
      // The same per-asset verification Stage 1 performed, unchanged.
      const check = verifySubmittedAsset(slot, submissionId, asset);
      if (!check.ok) {
        return check;
      }
      if (seenAssets.has(asset!.publicId)) {
        return { ok: false, error: "This report contains a duplicate entry." };
      }
      seenAssets.add(asset!.publicId);

      if (wantsPhoto) {
        images += 1;
        if (images > MOBILE_MAX_PHOTOS) {
          return { ok: false, error: `A report may carry at most ${MOBILE_MAX_PHOTOS} photos.` };
        }
        verified.push({
          id,
          kind: "image",
          slot,
          asset: asset!,
          caption: normaliseMobileCaption(item.caption),
        });
      } else {
        voices += 1;
        if (voices > MOBILE_MAX_VOICE_ITEMS) {
          return { ok: false, error: "A report may carry only one voice recording." };
        }
        verified.push({ id, kind: "voice", slot, asset: asset! });
      }
      continue;
    }

    return { ok: false, error: "This report could not be read." };
  }

  return { ok: true, items: verified };
}

// ---------------------------------------------------------------------------
// Stage 2 → the two things the existing Web Issue Tracker already reads
// ---------------------------------------------------------------------------

/** The one prefix a photo caption carries in the description. Kept as a
 *  constant so the writer and its tests cannot drift apart. */
export const MOBILE_CAPTION_PREFIX = "Caption: ";

/**
 * The human-readable description, built from what the worker actually wrote.
 *
 * This is how Stage 2 text and captions become visible to a Super Admin with
 * NO dashboard change and NO new database column at all: the Tracker already
 * renders issue_description, and both go there.
 *
 *   worker text      -> the line exactly as written, unlabelled
 *   photo caption    -> "Caption: <text>"
 *   photo, no caption-> nothing. No placeholder, no "N/A", no empty prefix.
 *
 * Order is the order the worker built the report in. Deliberately carries NO
 * Cloudinary URL and NO internal id.
 */
export function buildMobileDescription(items: VerifiedTimelineItem[]): string {
  const lines: string[] = [];

  for (const item of items) {
    if (item.kind === "text") {
      lines.push(item.text);
    } else if (item.kind === "image" && item.caption) {
      lines.push(`${MOBILE_CAPTION_PREFIX}${item.caption}`);
    }
  }

  const description = lines.join("\n").trim();
  return description.length > 0 ? description : MOBILE_FALLBACK_DESCRIPTION;
}

/** One ordered entry as stored. Assets are referenced by the SAME public_id and
 *  secure URL already stored in `images`/`attachments` — nothing is duplicated
 *  that could drift, and no credential is present. */
export type StoredTimelineEntry =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "image"; slot: string; public_id: string; url: string; caption: string | null }
  | { id: string; kind: "voice"; slot: string; public_id: string; url: string };

/**
 * Stage 2 extra_data.
 *
 * ── EXISTING CONSUMERS COME FIRST ───────────────────────────────────────────
 * `images[]` keeps the three-key legacy shape the existing gallery renders, and
 * `attachments[]` keeps the richer shape the existing audio player and
 * attachment reader use — with the recording still marked
 * `source: "voice_recording"`, which is inside ASSIGNEE_VISIBLE_SOURCES. Both
 * arrays follow timeline order, so an unchanged Tracker shows the photos in the
 * order the worker added them.
 *
 * `mobileTimeline` is ADDITIVE: a consumer that does not know about it is
 * unaffected, and a consumer that does can reconstruct text, order and the
 * photo↔caption relationship exactly.
 */
export function buildMobileTimelineExtraData(
  submissionId: string,
  items: VerifiedTimelineItem[]
): Record<string, unknown> {
  const images: StoredImageEntry[] = [];
  const attachments: StoredAttachmentEntry[] = [];
  const timeline: StoredTimelineEntry[] = [];
  let photoNumber = 0;

  for (const item of items) {
    if (item.kind === "text") {
      timeline.push({ id: item.id, kind: "text", text: item.text });
      continue;
    }

    if (item.kind === "image") {
      photoNumber += 1;
      const originalName = `evidence-photo-${photoNumber}.jpg`;
      images.push({
        url: item.asset.secureUrl,
        public_id: item.asset.publicId,
        original_name: originalName,
      });
      attachments.push({
        type: "image",
        url: item.asset.secureUrl,
        public_id: item.asset.publicId,
        original_name: originalName,
        mime_type: "image/jpeg",
        source: "upload",
        bytes: item.asset.bytes,
      });
      timeline.push({
        id: item.id,
        kind: "image",
        slot: item.slot,
        public_id: item.asset.publicId,
        url: item.asset.secureUrl,
        caption: item.caption,
      });
      continue;
    }

    attachments.push({
      type: "audio",
      url: item.asset.secureUrl,
      public_id: item.asset.publicId,
      original_name: "voice-recording",
      mime_type: item.asset.format ? `audio/${item.asset.format}` : "",
      source: "voice_recording",
      bytes: item.asset.bytes,
    });
    timeline.push({
      id: item.id,
      kind: "voice",
      slot: item.slot,
      public_id: item.asset.publicId,
      url: item.asset.secureUrl,
    });
  }

  return {
    images,
    attachments,
    [MOBILE_SUBMISSION_KEY]: submissionId,
    [MOBILE_SOURCE_KEY]: MOBILE_SOURCE_VALUE,
    [MOBILE_TIMELINE_KEY]: timeline,
  };
}
