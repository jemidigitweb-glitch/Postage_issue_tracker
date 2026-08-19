// Warehouse Mobile Lite — PURE rules for what a signed upload request may ask
// for: which slots exist, what a valid submission id looks like, and where in
// Cloudinary an asset is allowed to land.
//
// DELIBERATELY has no `server-only`, no `next/*`, no database and no network
// import — same discipline as lib/access/*, so every rule here is directly
// unit-testable (tests/mobileAccess.test.ts) without a request context, a
// Cloudinary account, or a browser.
//
// ── NO USER AUTHORIZATION LIVES HERE ────────────────────────────────────────
// This module answers "is this upload request well-formed and in-bounds", never
// "who is allowed to make it". WHO is decided by the ordinary Tracker session:
// proxy.ts requires one for /mobile, and every Mobile Lite Server Action
// re-checks `mobile:submit` (lib/access/permissions.ts) against the resolved
// user.
//
// Two earlier designs are named here so the history is reviewable: a username
// allowlist plus an "issue:create_mobile" permission, and after that an
// anonymous `wh_mobile` browser cookie for a worker who had no account. Both
// are gone — deleted, not left as dead code — now that a shared "Raised by
// Staff" login exists.

// ---------------------------------------------------------------------------
// Upload slots
// ---------------------------------------------------------------------------

/**
 * STAGE 1 slots. Kept exactly as they were.
 *
 * Stage 2 no longer mints these, but they remain valid forever: assets and
 * Issues created under the two-photo contract must keep verifying, and their
 * tests must keep passing, without any migration.
 */
export const MOBILE_UPLOAD_SLOTS = ["voice", "photo1", "photo2"] as const;
export type LegacyMobileUploadSlot = (typeof MOBILE_UPLOAD_SLOTS)[number];

/** Stage 2 photo slots: photo-1 … photo-10, and nothing else. */
export type MobilePhotoSlot = `photo-${number}`;
/** Stage 3 voice slots: voice-1 … voice-5, and nothing else. */
export type MobileVoiceSlot = `voice-${number}`;
export type MobileUploadSlot = LegacyMobileUploadSlot | MobilePhotoSlot | MobileVoiceSlot;

/**
 * The STAGE 1 / STAGE 2 voice slot. One recording per report was the rule when
 * this was minted, and it stays valid forever: assets and Issues created under
 * it must keep verifying without a migration.
 *
 * NEW recordings no longer use it — see mobileVoiceSlot() below.
 */
export const MOBILE_VOICE_SLOT = "voice" as const;

/** Stage 2 photo cap. Matches the existing desktop MAX_IMAGE_FILES rather than
 *  inventing a second number. */
export const MOBILE_MAX_PHOTOS = 10;

/**
 * Voice cap per Issue.
 *
 * SUPERSEDED: a report could carry exactly one recording, and a second one
 * replaced the first. A warehouse worker describing several things about one
 * problem had to say all of it in a single take, or lose the earlier attempt.
 * Five is the owner-approved number; it is enforced on the client AND, as the
 * only enforcement that counts, on the server in verifyMobileTimeline().
 */
export const MOBILE_MAX_VOICES = 5;

/**
 * How many voice SLOTS one submission may spend — which is not the same number.
 *
 * A slot is never recycled inside a submission (see nextVoiceSlot), so dropping
 * a staged recording and making another one costs a second slot even though the
 * Issue still carries one recording. With only five names, a worker who
 * re-recorded a few times would run out of slots while well under the five-
 * recording cap. Ten names give that headroom.
 *
 * The cap that decides what an Issue may CARRY is MOBILE_MAX_VOICES, enforced
 * server-side on the item count in verifyMobileTimeline(). This number only
 * bounds the namespace.
 */
export const MOBILE_VOICE_SLOT_COUNT = 10;

/**
 * The ONLY photo slot shape Stage 2 accepts — an explicit range, never a
 * free-form string. `photo-01`, `photo-0`, `photo-11` and `photo3` are all
 * refused, so a caller cannot widen the namespace by inventing a name.
 */
const PHOTO_SLOT_PATTERN = /^photo-([1-9]|10)$/;

/** Same discipline for voice: `voice-01`, `voice-0`, `voice-11` and `voice3`
 *  are all refused. */
const VOICE_SLOT_PATTERN = /^voice-([1-9]|10)$/;

export function isMobilePhotoSlot(value: unknown): value is MobilePhotoSlot {
  return typeof value === "string" && PHOTO_SLOT_PATTERN.test(value);
}

export function isMobileVoiceSlot(value: unknown): value is MobileVoiceSlot {
  return typeof value === "string" && VOICE_SLOT_PATTERN.test(value);
}

/** Composes the slot name for a 1-based photo index. Throws out of range, so a
 *  bug cannot quietly produce an unusable slot. */
export function mobilePhotoSlot(index: number): MobilePhotoSlot {
  if (!Number.isInteger(index) || index < 1 || index > MOBILE_MAX_PHOTOS) {
    throw new Error("Invalid photo index.");
  }
  return `photo-${index}`;
}

/** Composes the slot name for a 1-based voice SLOT index (not a recording
 *  number — see MOBILE_VOICE_SLOT_COUNT). Throws out of range, for the same
 *  reason mobilePhotoSlot() does. */
export function mobileVoiceSlot(index: number): MobileVoiceSlot {
  if (!Number.isInteger(index) || index < 1 || index > MOBILE_VOICE_SLOT_COUNT) {
    throw new Error("Invalid voice index.");
  }
  return `voice-${index}`;
}

/** True for any slot this system will sign an upload for: the Stage 2/3 ranges,
 *  plus the Stage 1 names for backward compatibility. */
export function isMobileUploadSlot(value: unknown): value is MobileUploadSlot {
  if (typeof value !== "string") return false;
  return (
    (MOBILE_UPLOAD_SLOTS as readonly string[]).includes(value) ||
    isMobilePhotoSlot(value) ||
    isMobileVoiceSlot(value)
  );
}

/** True when a slot holds a photo, in either stage's naming. */
export function isAnyPhotoSlot(value: unknown): value is MobileUploadSlot {
  return isMobilePhotoSlot(value) || value === "photo1" || value === "photo2";
}

/** True when a slot holds a recording, in either stage's naming. */
export function isAnyVoiceSlot(value: unknown): value is MobileUploadSlot {
  return isMobileVoiceSlot(value) || value === MOBILE_VOICE_SLOT;
}

/**
 * Cloudinary resource type per slot.
 *
 * Mirrors the existing desktop mapping in lib/cloudinary.ts: images go to
 * `image`, audio goes to `video` (Cloudinary stores audio under the video
 * resource type). Kept as its own map rather than imported, because that
 * module is `server-only` and this one must stay pure — the two are pinned
 * together by tests/mobileAccess.test.ts.
 */
export function resourceTypeForSlot(slot: MobileUploadSlot): "image" | "video" {
  return isAnyVoiceSlot(slot) ? "video" : "image";
}

// ---------------------------------------------------------------------------
// Submission id and public id
// ---------------------------------------------------------------------------

/** RFC 4122 shape, any version — what crypto.randomUUID() produces. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSubmissionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Folder that every Mobile Lite asset lands in. Separate from the desktop's
 *  `issue-tracker/intake`, so the two intake paths never share a namespace. */
export const MOBILE_UPLOAD_FOLDER = "issue-tracker/mobile";

/** Same shape as a submission id — a per-attempt UUID. Kept as its own
 *  function so a call site reads as what it means. */
export function isValidAttemptId(value: unknown): value is string {
  return isValidSubmissionId(value);
}

/**
 * The Cloudinary public_id for one ATTEMPT at one slot of one submission.
 *
 * ── THIS IS THE SECURITY BOUNDARY ───────────────────────────────────────────
 * The public_id is composed ENTIRELY on the server from two validated UUIDs
 * and a validated slot. The client never supplies one and cannot influence it
 * beyond choosing which of three fixed slots it is asking about. A signature is
 * therefore only ever usable to write to one exact path, and a later
 * registration action can recompute the expected value and compare it — so an
 * asset from another submission, another attempt, or an existing Issue can
 * never be attached.
 *
 * ── WHY THE ATTEMPT SEGMENT EXISTS ──────────────────────────────────────────
 * Uploads are signed with `overwrite=false`, and this repository's own
 * documentation of that flag (lib/cloudinary.ts) records the consequence:
 * Cloudinary RETURNS THE EXISTING ASSET for a public_id that is already
 * present, rather than replacing it. Without an attempt segment, a worker who
 * re-recorded a voice note would appear to upload successfully while the
 * ORIGINAL recording silently remained — losing the evidence they meant to
 * correct.
 *
 * The fix keeps `overwrite=false` (so nothing is ever destroyed) and gives a
 * deliberate replacement its own path:
 *
 *   retry of the SAME failed upload -> same attemptId -> same public_id
 *   deliberate replacement          -> new attemptId  -> new public_id
 *
 * Throws rather than returning a fallback: a caller that passes an invalid id
 * or slot has a bug, and silently signing a wrong path would be worse than
 * failing.
 */
export function buildMobilePublicId(
  submissionId: string,
  slot: MobileUploadSlot,
  attemptId: string
): string {
  if (!isValidSubmissionId(submissionId)) {
    throw new Error("Invalid submission id.");
  }
  if (!isMobileUploadSlot(slot)) {
    throw new Error("Invalid upload slot.");
  }
  if (!isValidAttemptId(attemptId)) {
    throw new Error("Invalid attempt id.");
  }
  return `${MOBILE_UPLOAD_FOLDER}/${submissionId}/${slot}/${attemptId}`;
}

// ---------------------------------------------------------------------------
// The client-facing signature payload
// ---------------------------------------------------------------------------

/**
 * Exactly what the browser is given so it can upload one file directly to
 * Cloudinary — and nothing else.
 *
 * `apiKey` is Cloudinary's PUBLIC identifier and is part of the documented
 * signed-upload contract; `signature` is a one-asset, time-limited proof.
 * `apiSecret` is absent from this type, so a change that tried to include it
 * would not compile.
 */
export interface MobileUploadTicket {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: "image" | "video";
}

/**
 * Assembles the ticket. Pure, so a test can prove the shape carries no secret
 * without a Cloudinary account.
 *
 * Every field is copied explicitly — nothing is spread — so a caller cannot
 * widen the response by passing a larger object.
 */
export function buildMobileUploadTicket(input: {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: "image" | "video";
}): MobileUploadTicket {
  return {
    cloudName: input.cloudName,
    apiKey: input.apiKey,
    timestamp: input.timestamp,
    signature: input.signature,
    publicId: input.publicId,
    resourceType: input.resourceType,
  };
}
