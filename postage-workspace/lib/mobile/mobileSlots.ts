import type { LegacyMobileUploadSlot } from "./mobileAccess";

// Warehouse Mobile Lite — the PURE state machine for the three media slots.
//
// No React, no `server-only`, no network: the whole retry-versus-replace
// distinction, the readiness rule and the superseded-asset bookkeeping are
// plain functions, so they are directly unit-testable (tests/mobileSlots.test.ts)
// without rendering anything. The Client Component is a thin shell over this.
//
// ── RETRY vs REPLACE — the distinction the whole design turns on ────────────
//   RETRY   the SAME file after a failed upload -> SAME attemptId
//           -> same public_id -> no second Cloudinary asset is created
//   REPLACE a deliberate re-record / retake     -> NEW attemptId
//           -> new public_id -> the old asset is untouched (overwrite=false)
//           and is recorded as SUPERSEDED rather than silently lost

export type SlotStatus = "empty" | "ready" | "uploading" | "uploaded" | "failed";

/** What Cloudinary returned for one successful upload. Recorded from the
 *  upload response, never from user input. */
export interface UploadedAsset {
  publicId: string;
  secureUrl: string;
  bytes: number;
  format: string;
  resourceType: "image" | "video";
}

export interface SlotState {
  status: SlotStatus;
  /** The current attempt. Null only while the slot is empty. */
  attemptId: string | null;
  /** The asset that would be registered for this slot right now. */
  asset: UploadedAsset | null;
  /** Assets replaced by a later deliberate attempt. Never deleted here —
   *  cleanup is a Stage 5 responsibility (see the note in the audit). */
  superseded: UploadedAsset[];
  /** Worker-facing message for the failed state. */
  error: string | null;
}

export type MobileSlots = Record<LegacyMobileUploadSlot, SlotState>;

export function emptySlot(): SlotState {
  return { status: "empty", attemptId: null, asset: null, superseded: [], error: null };
}

export function initialSlots(): MobileSlots {
  return { voice: emptySlot(), photo1: emptySlot(), photo2: emptySlot() };
}

/**
 * A NEW media attempt: the worker recorded or picked something.
 *
 * Requires a fresh attemptId from the caller (crypto.randomUUID()). Any asset
 * that was active becomes SUPERSEDED — it is kept in the list, not discarded,
 * and it is never overwritten in Cloudinary. The slot is no longer "uploaded",
 * so REGISTER correctly becomes unavailable until the new attempt lands.
 */
export function selectMedia(state: SlotState, attemptId: string): SlotState {
  return {
    status: "ready",
    attemptId,
    asset: null,
    superseded: state.asset ? [...state.superseded, state.asset] : state.superseded,
    error: null,
  };
}

/** Upload begun for the CURRENT attempt. */
export function uploadStarted(state: SlotState): SlotState {
  return { ...state, status: "uploading", error: null };
}

/** Upload succeeded: this asset becomes the slot's active media. */
export function uploadSucceeded(state: SlotState, asset: UploadedAsset): SlotState {
  return { ...state, status: "uploaded", asset, error: null };
}

/** Upload failed. The attemptId is DELIBERATELY preserved so a retry reuses
 *  the same public_id instead of creating a second Cloudinary asset. */
export function uploadFailed(state: SlotState, error: string): SlotState {
  return { ...state, status: "failed", error };
}

/**
 * Retry of the SAME file after a failure.
 *
 * Keeps the attemptId — this is the rule that stops a flaky warehouse network
 * from littering Cloudinary with duplicates of one photo. Retrying anything
 * other than a failed attempt is a no-op.
 */
export function retryUpload(state: SlotState): SlotState {
  if (state.status !== "failed" || !state.attemptId) {
    return state;
  }
  return { ...state, status: "ready", error: null };
}

/** True when this slot has one successfully uploaded, current asset. */
export function isSlotUploaded(state: SlotState): boolean {
  return state.status === "uploaded" && state.asset !== null;
}

/**
 * REGISTER readiness: all three slots uploaded, and nothing else.
 *
 * Stage 4 uses this only to enable the control — pressing it creates nothing.
 */
export function isRegisterReady(slots: MobileSlots): boolean {
  return isSlotUploaded(slots.voice) && isSlotUploaded(slots.photo1) && isSlotUploaded(slots.photo2);
}

/** Every asset replaced during this report, across all slots. Stage 5 will
 *  decide what to do with them; Stage 4 only keeps the record. */
export function supersededAssets(slots: MobileSlots): UploadedAsset[] {
  return [...slots.voice.superseded, ...slots.photo1.superseded, ...slots.photo2.superseded];
}
