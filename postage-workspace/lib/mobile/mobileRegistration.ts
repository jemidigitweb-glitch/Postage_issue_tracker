import {
  MOBILE_UPLOAD_FOLDER,
  MOBILE_UPLOAD_SLOTS,
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

/** Fixed description. The recording is the evidence; no text is asked of the
 *  worker, so none is invented on their behalf. */
export const MOBILE_DESCRIPTION =
  "Warehouse Mobile report. The attached voice recording is the primary issue evidence, accompanied by two evidence photos.";

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
