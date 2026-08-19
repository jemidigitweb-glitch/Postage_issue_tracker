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
// This prompt is ours, so we control when it appears — the FIRST time a kind is
// used in a session, immediately before the media call, never after. It does
// not replace the browser's permission (it cannot, and must not pretend to); it
// makes the worker's intent explicit before anything is opened.
//
// ── ASK ONCE PER SESSION, PER KIND ──────────────────────────────────────────
// SUPERSEDED: this sheet appeared on EVERY tap. Recording Voice 2 and Voice 3
// meant answering the same question three times, and the owner asked for it to
// stop. The explanation is now shown once per media kind per /mobile session.
//
// The three kinds are tracked SEPARATELY — agreeing to the photo picker says
// nothing about the microphone — and the state is `unknown | allowed` only.
// There is no "denied": pressing Cancel simply does not record anything, so the
// next attempt asks again.
//
// ── WHAT "ALLOWED" DOES AND DOES NOT MEAN ───────────────────────────────────
//   IT MEANS      do not show OUR explanation again during this session.
//   IT DOES NOT   open a camera, a microphone or a picker on its own.
//
// Every media access still requires the worker's own explicit tap, every time.
// Nothing here is reachable from page load, from login, from a successful
// registration, or from starting the next Issue.
//
// ── STILL NOTHING IS PERSISTED ──────────────────────────────────────────────
// No localStorage, no cookie, no database column, no user preference. This is a
// plain value held in component state for the life of one mounted composer, so
// a logout, a refresh, or a remounted /mobile all start again at `unknown`. A
// permanently remembered consent would recreate exactly the invisibility this
// exists to prevent.
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

// ---------------------------------------------------------------------------
// Session consent state
// ---------------------------------------------------------------------------

/**
 * What is known about one media kind in THIS session.
 *
 *   "unknown"  the explanation has not been accepted yet — ask before using it
 *   "allowed"  the worker has read and accepted it — do not ask again
 *
 * There is deliberately no "denied" value. A Cancel records nothing at all, so
 * the state stays "unknown" and the next attempt asks again; and a refusal by
 * the BROWSER is a device fact, not the worker's answer to our question, so it
 * is never written here either.
 */
export type MediaConsentStatus = "unknown" | "allowed";

/** One status per kind. Nothing else is tracked, and nothing is stored. */
export type MediaConsentState = Readonly<Record<MediaConsentKind, MediaConsentStatus>>;

/** A fresh session: nothing agreed to yet. */
export function initialMediaConsent(): MediaConsentState {
  return { gallery: "unknown", camera: "unknown", voice: "unknown" };
}

/** True when this kind has already been explained and accepted this session. */
export function isMediaConsentAllowed(state: MediaConsentState, kind: MediaConsentKind): boolean {
  return state[kind] === "allowed";
}

/** True when the sheet must be shown before the media call. The inverse of the
 *  above, named for the question the caller is actually asking. */
export function needsMediaConsent(state: MediaConsentState, kind: MediaConsentKind): boolean {
  return !isMediaConsentAllowed(state, kind);
}

/**
 * Records that the worker accepted the explanation for ONE kind.
 *
 * Returns a new state — the other two kinds are copied through untouched, so
 * accepting the photo picker can never be read as accepting the microphone.
 */
export function grantMediaConsent(
  state: MediaConsentState,
  kind: MediaConsentKind
): MediaConsentState {
  return { ...state, [kind]: "allowed" };
}

/**
 * Cancel. Deliberately an IDENTITY function.
 *
 * It exists so the composer's decline path is a named, tested decision rather
 * than an absent line of code: pressing Cancel must leave the state exactly as
 * it was, which is what makes the next attempt ask again.
 */
export function declineMediaConsent(
  state: MediaConsentState,
  _kind: MediaConsentKind
): MediaConsentState {
  return state;
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
