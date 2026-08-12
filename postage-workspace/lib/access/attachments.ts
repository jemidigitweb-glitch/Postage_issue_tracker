// Pure validation and normalisation for Issue evidence attachments.
//
// DELIBERATELY has no `server-only` import, no `next/*` import and no network
// or database import — same discipline as the rest of lib/access/*, so every
// rule is directly unit-testable (tests/attachments.test.ts) without a request
// context, a Cloudinary account, or a browser.
//
// ── WHY BYTES, NOT THE BROWSER'S WORD ───────────────────────────────────────
// A File's `type` and filename both come from the client and are trivially
// forged. Everything here that matters is decided by SNIFFING THE LEADING
// BYTES of the actual upload. The declared MIME type and extension are used
// only as a fast pre-filter and to produce a helpful message; they can never
// admit a file whose bytes disagree.
//
// ── WHAT IS ACCEPTED ────────────────────────────────────────────────────────
// Images: JPEG only (.jpg/.jpeg), because that is what this stage asked for.
// Audio:  the container formats a browser can both record and play back.
// Nothing else — no archives, no PDFs, no executables, no SVG (which is
// script-bearing markup, not a raster image).

/** Max bytes per image. Generous for a phone photo, far below anything that
 *  would stress the upload path. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Max bytes per audio file. A few minutes of voice at ordinary bitrates. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
/** Caps on how many of each may accompany one Issue. */
export const MAX_IMAGE_FILES = 10;
export const MAX_AUDIO_FILES = 5;

export type AttachmentKind = "image" | "audio";
/**
 * How the file reached us. Recorded so a voice note is distinguishable from an
 * uploaded audio file without inspecting the filename.
 *
 *   "upload"          picked from disk in Add New Issue
 *   "voice_recording" recorded in the browser in Add New Issue
 *   "historical"      imported from the pre-existing source material by
 *                     scripts/import-historical-audio.ts. Kept distinct
 *                     because the two portals treat it differently: the Super
 *                     Admin sees historical evidence, while the Assignee
 *                     portal deliberately gains no new historical-audio UI.
 */
export type AttachmentSource = "upload" | "voice_recording" | "historical";

/** The sources an Assignee may see — everything attached through the
 *  Add-New-Issue flow they already had. Historical imports are excluded so
 *  this stage introduces no new Assignee-portal display. */
export const ASSIGNEE_VISIBLE_SOURCES: readonly AttachmentSource[] = ["upload", "voice_recording"];

/** Extensions offered to the file picker and re-checked on the server. */
export const IMAGE_EXTENSIONS = Object.freeze([".jpg", ".jpeg"] as const);
export const AUDIO_EXTENSIONS = Object.freeze([
  ".mp3",
  ".m4a",
  ".mp4",
  ".wav",
  ".ogg",
  ".oga",
  ".webm",
] as const);

/** The `accept` attribute for each input. Client convenience only — it filters
 *  the picker, it does not decide anything. */
export const IMAGE_ACCEPT = "image/jpeg,.jpg,.jpeg";
export const AUDIO_ACCEPT = "audio/*,.mp3,.m4a,.mp4,.wav,.ogg,.oga,.webm";

// ---------------------------------------------------------------------------
// Magic-byte sniffing
// ---------------------------------------------------------------------------

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** ASCII compare at an offset — used for the RIFF/WAVE and ftyp box tags. */
function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** True for a real JPEG: every JPEG starts SOI (FFD8) followed by a marker. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

/**
 * True for a container this application accepts as audio.
 *
 * Recognised: MP3 (ID3 tag or a frame sync), WAV (RIFF….WAVE), OGG/Opus
 * (OggS), MP4/M4A (….ftyp), and WebM/Matroska (EBML) — which is what Chrome's
 * MediaRecorder produces.
 *
 * WebM and MP4 are also VIDEO containers. That is accepted deliberately: they
 * are exactly what a browser records voice into, and Cloudinary stores both
 * under the same resource type. The risk being guarded against here is an
 * executable or a script dressed as media, and none of these signatures admits
 * one.
 */
export function looksLikeAudio(bytes: Uint8Array): boolean {
  // MP3: "ID3" tag, or an MPEG frame sync (0xFF Ex/Fx).
  if (asciiAt(bytes, 0, "ID3")) return true;
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  // WAV: "RIFF" .... "WAVE"
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) return true;
  // OGG / Opus
  if (asciiAt(bytes, 0, "OggS")) return true;
  // MP4 / M4A: box length, then "ftyp"
  if (asciiAt(bytes, 4, "ftyp")) return true;
  // WebM / Matroska: EBML header
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return true;
  // FLAC, occasionally produced by desktop recorders
  if (asciiAt(bytes, 0, "fLaC")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Filename sanitisation
// ---------------------------------------------------------------------------

/**
 * Reduces a client-supplied filename to something safe to store and display.
 *
 * Strips any directory component (a browser can send "../../etc/passwd" in a
 * folder upload), removes control characters and anything outside a
 * conservative allow-list, collapses runs of separators, and caps the length.
 * Returns "attachment" if nothing usable survives, so a stored name is never
 * empty.
 *
 * This value is DISPLAY metadata and part of the Cloudinary public_id. It is
 * never used to build a filesystem path.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // Control characters are removed by code point rather than by a regex
  // literal: a literal containing them is easy to mangle in transit and
  // impossible to read in a diff. Then a positive allow-list — letters,
  // digits, dot, underscore, space, hyphen. Everything else is DROPPED
  // rather than escaped; no evidence filename needs it, and a dropped
  // character cannot be mis-decoded later the way an escape can.
  const withoutControls = Array.from(base)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");

  const cleaned = withoutControls
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.-]+/, "");

  const capped = cleaned.slice(0, 120).trim();
  return capped || "attachment";
}

/** Lower-cased extension including the dot, or "" when there is none. */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot).toLowerCase();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface CandidateFile {
  /** Client-supplied name. Sanitised before use, never trusted. */
  name: string;
  /** Client-supplied MIME. A hint only — the bytes decide. */
  declaredType: string;
  size: number;
  /** The first bytes of the file. 16 is plenty for every signature above. */
  head: Uint8Array;
}

export type FileCheck = { ok: true } | { ok: false; error: string };

/**
 * Validates one candidate against a kind.
 *
 * Order matters: size first (cheapest, and the most common genuine mistake),
 * then extension, then the bytes. The byte check is last and is the one that
 * actually decides — an attacker who renames `payload.exe` to `photo.jpg` and
 * sets `image/jpeg` still fails here.
 */
export function validateFile(kind: AttachmentKind, file: CandidateFile): FileCheck {
  const label = sanitizeFilename(file.name);

  if (file.size <= 0) {
    return { ok: false, error: `"${label}" is empty.` };
  }

  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (file.size > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024));
    return { ok: false, error: `"${label}" is larger than ${mb} MB.` };
  }

  const extension = fileExtension(file.name);
  const allowed: readonly string[] = kind === "image" ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS;
  // A recorded blob may legitimately arrive with no extension; the byte check
  // below still has to pass, so this is not a hole.
  if (extension && !allowed.includes(extension)) {
    return {
      ok: false,
      error: `"${label}" is not an accepted ${kind} type (allowed: ${allowed.join(", ")}).`,
    };
  }

  const bytesOk = kind === "image" ? looksLikeJpeg(file.head) : looksLikeAudio(file.head);
  if (!bytesOk) {
    return {
      ok: false,
      error:
        kind === "image"
          ? `"${label}" is not a valid JPEG image. Only real .jpg/.jpeg files are accepted.`
          : `"${label}" is not a recognised audio file.`,
    };
  }

  return { ok: true };
}

/** Enforces the per-Issue count caps. */
export function validateFileCount(kind: AttachmentKind, count: number): FileCheck {
  const max: number = kind === "image" ? MAX_IMAGE_FILES : MAX_AUDIO_FILES;
  if (count > max) {
    return { ok: false, error: `Attach at most ${max} ${kind} file${max === 1 ? "" : "s"}.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stored shape
// ---------------------------------------------------------------------------

/**
 * The BACKWARD-COMPATIBLE image entry.
 *
 * Exactly the three keys the 64 historical images already use (confirmed by
 * audit: `original_name`, `public_id`, `url` and nothing else), so
 * components/issues/IssueDetail.tsx's existing gallery renders new images with
 * no change at all. New images are written in BOTH places — here, and in the
 * richer `attachments` array below — because the gallery reads `images` and
 * must keep doing so.
 */
export interface StoredImage {
  url: string;
  public_id: string;
  original_name: string;
}

/**
 * The richer entry, stored under a NEW `extra_data.attachments` key.
 *
 * Additive: no historical Issue has this key (audit confirmed 0 of 145), no
 * existing reader looks for it, and nothing about `images` changes. That is
 * what makes this stage need NO schema migration — extra_data is already
 * JSONB with a `jsonb_typeof = object` constraint, and adding a key to a new
 * row's object satisfies it.
 */
export interface StoredAttachment {
  type: AttachmentKind;
  url: string;
  public_id: string;
  original_name: string;
  mime_type: string;
  source: AttachmentSource;
  bytes: number;
}

/** Every source string that may appear on a stored attachment. Anything else
 *  is normalised to "upload" rather than trusted. */
const KNOWN_SOURCES: readonly string[] = ["upload", "voice_recording", "historical"];

/**
 * Narrows unknown JSONB to the audio attachments, validating every field
 * rather than trusting the stored shape.
 *
 * `allowedSources` filters by provenance. The Super Admin detail page passes
 * nothing (see everything); the Assignee detail page passes
 * ASSIGNEE_VISIBLE_SOURCES, so historical imports never appear there — the
 * filter is applied SERVER-SIDE, so an Assignee's page never even receives the
 * historical URLs.
 */
export function readAudioAttachments(
  value: unknown,
  allowedSources?: readonly AttachmentSource[]
): StoredAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (record.type !== "audio") return [];
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url || !/^https:\/\//i.test(url)) return [];

    const rawSource = typeof record.source === "string" ? record.source : "";
    const source: AttachmentSource = KNOWN_SOURCES.includes(rawSource)
      ? (rawSource as AttachmentSource)
      : "upload";
    if (allowedSources && !allowedSources.includes(source)) return [];

    return [
      {
        type: "audio" as const,
        url,
        public_id: typeof record.public_id === "string" ? record.public_id : "",
        original_name:
          typeof record.original_name === "string" && record.original_name.trim()
            ? record.original_name.trim()
            : "Audio attachment",
        mime_type: typeof record.mime_type === "string" ? record.mime_type : "",
        source,
        bytes: typeof record.bytes === "number" && Number.isFinite(record.bytes) ? record.bytes : 0,
      },
    ];
  });
}

/** Human-readable size for the attachment list. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
