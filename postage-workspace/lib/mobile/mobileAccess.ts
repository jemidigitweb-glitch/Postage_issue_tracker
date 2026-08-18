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
// SUPERSEDED (Stage 3 Correction): an earlier revision gated Mobile Lite on an
// Issue Tracker login plus a username allowlist. The owner clarified that a
// warehouse worker must be able to use /mobile WITHOUT a Tracker account, so
// that design — the "issue:create_mobile" permission, the
// MOBILE_LITE_ALLOWED_USERNAMES allowlist and canAccessMobileLite() — was
// removed rather than left as dead code. Mobile Lite requests are now bound to
// a browser by the anonymous session in ./mobileSessionToken.ts, which
// identifies nobody and grants nothing.

// ---------------------------------------------------------------------------
// Upload slots
// ---------------------------------------------------------------------------

/** The ONLY three assets a Mobile Lite submission may carry. Anything else is
 *  refused before a signature is minted. */
export const MOBILE_UPLOAD_SLOTS = ["voice", "photo1", "photo2"] as const;
export type MobileUploadSlot = (typeof MOBILE_UPLOAD_SLOTS)[number];

export function isMobileUploadSlot(value: unknown): value is MobileUploadSlot {
  return typeof value === "string" && (MOBILE_UPLOAD_SLOTS as readonly string[]).includes(value);
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
  return slot === "voice" ? "video" : "image";
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
