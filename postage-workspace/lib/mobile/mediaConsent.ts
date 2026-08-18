// Warehouse Mobile Lite — the app's OWN consent prompt for media access.
//
// PURE: no `server-only`, no `next/*`, no DOM, no database — the copy and the
// rules are plain data, directly unit-testable (tests/mediaConsent.test.ts)
// without rendering anything.
//
// ── WHY AN APP-LEVEL PROMPT AT ALL ──────────────────────────────────────────
// The browser's own camera/microphone prompt is shown ONCE and then remembered:
// after the first "Allow", a later getUserMedia() call opens the microphone
// with no visible question. A worker holding a shared warehouse phone would
// have no way to tell that a tap was about to record them.
//
// This prompt is ours, so we control when it appears — and it appears EVERY
// time, immediately before the media call, never after. It does not replace the
// browser's permission (it cannot, and must not pretend to); it makes the
// worker's intent explicit before anything is opened.
//
// ── ASK EVERY TIME ──────────────────────────────────────────────────────────
// There is deliberately no persistence here: no localStorage, no cookie, no
// "don't ask again", no in-memory "already allowed" flag. The consent state
// lives in component state for the duration of one prompt and is discarded the
// moment the prompt closes, whichever button was pressed. A permanently
// remembered consent would recreate exactly the invisibility this exists to
// prevent.
//
// ── WHAT IT NEVER ASKS FOR ──────────────────────────────────────────────────
// Three kinds, and no fourth: photo library, camera, microphone. No location,
// contacts, notifications, Bluetooth or filesystem permission is requested by
// Mobile Lite anywhere, and none is described here.

/** The three media actions that require consent. There is no fourth. */
export const MEDIA_CONSENT_KINDS = ["gallery", "camera", "voice"] as const;

export type MediaConsentKind = (typeof MEDIA_CONSENT_KINDS)[number];

export interface MediaConsentPrompt {
  /** Sheet heading. A question, so the answer buttons make sense. */
  title: string;
  /** One sentence: what is accessed, and the limit on how it is used. */
  body: string;
  /** The affirmative button. Names the action, never a bare "OK" — a worker
   *  should be able to read only the button and know what happens. */
  confirmLabel: string;
  /** The way out. Identical for all three, so the safe choice is in the same
   *  place every time. */
  cancelLabel: string;
}

/**
 * The exact copy for each kind, as approved.
 *
 * Gallery's wording is deliberately different in kind from the other two: a
 * photo picker grants no standing access to anything, so promising that "only
 * the photos you select will be used" is the honest claim. Camera and
 * microphone DO open a device, so those two say what the device is used for and
 * scope it to this Issue.
 */
const PROMPTS: Readonly<Record<MediaConsentKind, MediaConsentPrompt>> = {
  gallery: {
    title: "Choose Photos?",
    body: "You'll choose which photos to add to this Issue. Only the photos you select will be used.",
    confirmLabel: "Choose Photos",
    cancelLabel: "Cancel",
  },
  camera: {
    title: "Allow Camera Access?",
    body: "Your camera will only be used to take photos for this Issue.",
    confirmLabel: "Allow Camera",
    cancelLabel: "Cancel",
  },
  voice: {
    title: "Allow Microphone Access?",
    body: "Your microphone will only be used while recording a voice message for this Issue.",
    confirmLabel: "Allow Microphone",
    cancelLabel: "Cancel",
  },
};

/** The prompt for a kind. Total over the union — no default, no fallback. */
export function mediaConsentPrompt(kind: MediaConsentKind): MediaConsentPrompt {
  return PROMPTS[kind];
}

/** Type guard, so a value arriving from anywhere untyped cannot open a sheet
 *  for a kind that does not exist. */
export function isMediaConsentKind(value: unknown): value is MediaConsentKind {
  return (
    typeof value === "string" && (MEDIA_CONSENT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Shown when the DEVICE refuses after the worker has already agreed here.
 *
 * Consent and permission are two different things: agreeing to this prompt is
 * the worker saying yes, and the browser may still say no — a revoked site
 * permission, no microphone attached, or an OS-level block. The message says
 * what happened without blaming the worker and without offering a retry loop.
 */
export const MEDIA_DENIED_MESSAGE: Readonly<Record<"camera" | "voice", string>> = {
  camera: "Camera access was not allowed.",
  voice: "Microphone access was not allowed.",
};
