import "server-only";

import { createHash } from "node:crypto";

import {
  sanitizeFilename,
  type AttachmentKind,
  type AttachmentSource,
  type StoredAttachment,
} from "./access/attachments";

// Server-only Cloudinary uploads for Issue evidence.
//
// The `server-only` import above makes this module a BUILD ERROR if it is ever
// imported into a Client Component, directly or transitively — the same
// structural guarantee lib/db.ts relies on. That matters more here than usual:
// this file reads CLOUDINARY_API_SECRET.
//
// ── CREDENTIALS ─────────────────────────────────────────────────────────────
// CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are read
// from process.env, are NOT prefixed NEXT_PUBLIC_ (Next.js only inlines that
// prefix into client bundles), and are never returned, logged, or included in
// any error message. Uploads are SIGNED here on the server and the browser
// never receives a key, a signature, or an upload preset — it posts its files
// to a Server Action and gets back only the resulting https URLs.
//
// ── NO SDK ──────────────────────────────────────────────────────────────────
// Deliberately plain fetch + a SHA-1 signature rather than adding the
// cloudinary npm package. The signed-upload contract is a handful of form
// fields; a dependency for that would be more surface than the code it saves.
//
// ── RESOURCE TYPES ──────────────────────────────────────────────────────────
// JPEGs go to `image`, matching where the 64 historical Issue images already
// live. Audio goes to `video`: Cloudinary handles audio under the video
// resource type, and that is the documented target for mp3/m4a/wav/ogg/webm.
// The application's own vocabulary stays "image" | "audio" — the Cloudinary
// resource type is an implementation detail confined to this file.

const CLOUD_NAME_VAR = "CLOUDINARY_CLOUD_NAME";
const API_KEY_VAR = "CLOUDINARY_API_KEY";
const API_SECRET_VAR = "CLOUDINARY_API_SECRET";

/** Where new evidence lands. Uploads happen BEFORE the Issue exists (so a
 *  failed upload never leaves a half-documented Issue), which is why this is
 *  not the per-Issue folder the historical migration used — the Issue ID is
 *  not known yet. The stored public_id is the authoritative handle either
 *  way; the folder is organisational only. */
const UPLOAD_FOLDER = "issue-tracker/intake";

export class CloudinaryConfigError extends Error {}
export class CloudinaryUploadError extends Error {}

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads and validates configuration. Throws naming ONLY the missing variable —
 * never a value. Checked lazily (per call, not at module load) for the same
 * reason lib/db.ts defers its DATABASE_URL check: `next build` evaluates
 * modules while collecting page data, and an eager throw would break builds in
 * environments that have no Cloudinary account configured.
 */
function readConfig(): CloudinaryConfig {
  const cloudName = process.env[CLOUD_NAME_VAR];
  const apiKey = process.env[API_KEY_VAR];
  const apiSecret = process.env[API_SECRET_VAR];

  const missing = [
    cloudName ? null : CLOUD_NAME_VAR,
    apiKey ? null : API_KEY_VAR,
    apiSecret ? null : API_SECRET_VAR,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new CloudinaryConfigError(
      `Attachment storage is not configured. Missing: ${missing.join(", ")}.`
    );
  }

  return { cloudName: cloudName!, apiKey: apiKey!, apiSecret: apiSecret! };
}

/** True when uploads can be attempted at all — lets a caller fail fast with a
 *  clear message instead of after the user has filled in a long form. */
export function isAttachmentStorageConfigured(): boolean {
  return Boolean(
    process.env[CLOUD_NAME_VAR] && process.env[API_KEY_VAR] && process.env[API_SECRET_VAR]
  );
}

/**
 * Cloudinary's signature: the signed parameters sorted by key, joined as
 * `k=v&k=v`, with the API secret appended, then SHA-1 hex.
 *
 * `api_key`, `file`, `resource_type` and the signature itself are excluded
 * from the signed string by Cloudinary's contract. The secret is used here and
 * nowhere else, and never leaves this function.
 */
function sign(params: Record<string, string>, apiSecret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

const RESOURCE_TYPE: Record<AttachmentKind, "image" | "video"> = {
  image: "image",
  audio: "video",
};

export interface UploadInput {
  kind: AttachmentKind;
  source: AttachmentSource;
  /** Client-supplied name; sanitised before it is used anywhere. */
  originalName: string;
  /** Client-supplied MIME; stored as metadata only, never trusted for
   *  validation (that already happened against the bytes). */
  declaredType: string;
  bytes: Uint8Array;
  /**
   * OPTIONAL deterministic public_id, e.g. "issue-tracker/ND-001/recording-001".
   *
   * Used by the historical-audio import so a rerun is idempotent: combined
   * with overwrite=false, Cloudinary returns the EXISTING asset for a
   * public_id that is already present instead of creating a second copy with
   * a random suffix. It also matches the folder convention the historical
   * image migration already used.
   *
   * Omitted by the Add-New-Issue path, which keeps the original behaviour —
   * a unique suffix under issue-tracker/intake, because two users can upload
   * "photo.jpg" for different Issues in the same second.
   */
  publicId?: string;
}

interface CloudinaryResponse {
  secure_url?: string;
  public_id?: string;
  bytes?: number;
  error?: { message?: string };
}

/**
 * Uploads one file and returns the metadata to store on the Issue.
 *
 * Throws CloudinaryUploadError on any failure — a non-2xx response, a
 * malformed body, or a missing URL. The caller must treat that as fatal for
 * the whole submission: evidence is never silently dropped.
 *
 * The upload is unique-suffixed (`unique_filename`), so two files with the
 * same name never overwrite each other, and `overwrite` is false so an upload
 * can never replace a historical asset.
 */
export async function uploadAttachment(input: UploadInput): Promise<StoredAttachment> {
  const config = readConfig();
  const resourceType = RESOURCE_TYPE[input.kind];
  const originalName = sanitizeFilename(input.originalName);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // A deterministic public_id replaces the folder+unique-suffix scheme.
  // overwrite stays "false" in BOTH modes: an upload can never replace an
  // existing asset, which is what makes the historical import safe to rerun
  // and what stops a new upload from clobbering a historical one.
  const signedParams: Record<string, string> = input.publicId
    ? { public_id: input.publicId, timestamp, overwrite: "false" }
    : { folder: UPLOAD_FOLDER, timestamp, unique_filename: "true", overwrite: "false" };

  const form = new FormData();
  for (const [key, value] of Object.entries(signedParams)) {
    form.append(key, value);
  }
  form.append("api_key", config.apiKey);
  form.append("signature", sign(signedParams, config.apiSecret));
  // Copy into a fresh ArrayBuffer so the Blob owns exactly these bytes —
  // a Uint8Array view can be a window onto a larger pooled buffer.
  form.append(
    "file",
    new Blob([input.bytes.slice().buffer as ArrayBuffer], {
      type: input.declaredType || "application/octet-stream",
    }),
    originalName
  );

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
      { method: "POST", body: form }
    );
  } catch (error) {
    // Never surface the raw network error: it can contain the request URL,
    // which contains the cloud name.
    console.error("[cloudinary] upload request failed:", error);
    throw new CloudinaryUploadError(`Could not upload "${originalName}". Please try again.`);
  }

  let payload: CloudinaryResponse;
  try {
    payload = (await response.json()) as CloudinaryResponse;
  } catch {
    throw new CloudinaryUploadError(`Could not upload "${originalName}". Please try again.`);
  }

  if (!response.ok || !payload.secure_url || !payload.public_id) {
    // Cloudinary's own message is logged server-side for diagnosis but is not
    // returned to the browser.
    console.error("[cloudinary] upload rejected:", response.status, payload.error?.message);
    throw new CloudinaryUploadError(`Could not upload "${originalName}". Please try again.`);
  }

  return {
    type: input.kind,
    url: payload.secure_url,
    public_id: payload.public_id,
    original_name: originalName,
    mime_type: input.declaredType || "",
    source: input.source,
    bytes: typeof payload.bytes === "number" ? payload.bytes : input.bytes.byteLength,
  };
}

/**
 * Best-effort cleanup of already-uploaded assets when the Issue insert fails
 * afterwards.
 *
 * Deliberately never throws: the caller is already handling a failure and
 * reporting it to the user, and a cleanup problem must not replace that with a
 * more confusing error. Anything that cannot be removed is logged so it can be
 * swept manually — an orphaned asset costs storage, not correctness.
 */
export async function deleteAttachments(attachments: StoredAttachment[]): Promise<void> {
  if (attachments.length === 0) return;

  let config: CloudinaryConfig;
  try {
    config = readConfig();
  } catch {
    return;
  }

  for (const attachment of attachments) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedParams = { public_id: attachment.public_id, timestamp };
    const form = new FormData();
    form.append("public_id", attachment.public_id);
    form.append("timestamp", timestamp);
    form.append("api_key", config.apiKey);
    form.append("signature", sign(signedParams, config.apiSecret));

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${config.cloudName}/${RESOURCE_TYPE[attachment.type]}/destroy`,
        { method: "POST", body: form }
      );
      if (!response.ok) {
        console.error(
          "[cloudinary] orphan cleanup failed for",
          attachment.public_id,
          response.status
        );
      }
    } catch (error) {
      console.error("[cloudinary] orphan cleanup failed for", attachment.public_id, error);
    }
  }
}
