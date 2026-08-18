import { looksLikeAudio, looksLikeJpeg } from "../access/attachments";

// Warehouse Mobile Lite — PURE media rules for the worker's phone.
//
// Safe in a Client Component: no `server-only`, no `next/*`, no database, no
// network. It REUSES the existing byte sniffers from lib/access/attachments.ts
// (also pure) rather than restating them, so a phone and the server can never
// disagree about what a JPEG or an audio container is.
//
// ── THE DESKTOP VALIDATOR IS NOT WEAKENED ───────────────────────────────────
// Nothing here modifies lib/access/attachments.ts. The desktop keeps its own
// limits (10 MB images, 25 MB audio, 10/5 files). Mobile Lite applies its own,
// TIGHTER caps on top, because a warehouse phone on a weak link is a different
// problem from a desktop upload. Tighter is safe; looser would not be, and is
// not possible from here.

/** Mobile-only caps. Deliberately below the desktop's 10 MB / 25 MB. */
export const MOBILE_MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const MOBILE_MAX_VOICE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Version 1 product limit — a UI/product decision, not a database or
 *  architecture constraint. Recording auto-stops here, keeping the worst-case
 *  upload small on a weak warehouse link. */
export const MOBILE_MAX_RECORDING_SECONDS = 180; // 3 minutes

/** Bytes needed to identify every container the sniffers know. */
export const MOBILE_SNIFF_BYTES = 16;

export type MobileMediaCheck = { ok: true } | { ok: false; error: string };

/**
 * Actionable HEIC guidance.
 *
 * A warehouse worker cannot act on "not a valid JPEG": the fix is a camera
 * setting, so the message names it. HEIC remains a real-iPhone UAT item — no
 * conversion library is added, and the global validator is untouched.
 */
export const PHOTO_FORMAT_ERROR =
  "That photo format is not supported. On iPhone: Settings → Camera → Formats → Most Compatible, then take the photo again.";

/**
 * Validates one evidence photo before a signature is requested.
 *
 * Order mirrors the desktop validator: emptiness, then size (the most common
 * genuine mistake), then THE BYTES, which decide. A HEIC renamed to .jpg still
 * fails, because the magic bytes are checked, not the name.
 */
export function validateMobilePhoto(input: { size: number; head: Uint8Array }): MobileMediaCheck {
  if (input.size <= 0) {
    return { ok: false, error: "That photo is empty. Please take it again." };
  }
  if (input.size > MOBILE_MAX_PHOTO_BYTES) {
    return { ok: false, error: "That photo is larger than 5 MB. Please take it again." };
  }
  if (!looksLikeJpeg(input.head)) {
    return { ok: false, error: PHOTO_FORMAT_ERROR };
  }
  return { ok: true };
}

/**
 * Validates the voice recording before a signature is requested.
 *
 * Accepts exactly the containers the existing media system already accepts —
 * which includes both formats a browser records into (WebM/Opus on Android and
 * desktop Chrome, MP4/AAC on iOS Safari).
 */
export function validateMobileVoice(input: { size: number; head: Uint8Array }): MobileMediaCheck {
  if (input.size <= 0) {
    return { ok: false, error: "The recording is empty. Please record again." };
  }
  if (input.size > MOBILE_MAX_VOICE_BYTES) {
    return {
      ok: false,
      error: "That recording is larger than 5 MB. Please record a shorter note.",
    };
  }
  if (!looksLikeAudio(input.head)) {
    return { ok: false, error: "That recording format is not supported. Please record again." };
  }
  return { ok: true };
}

/** mm:ss for the recording timer. */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
