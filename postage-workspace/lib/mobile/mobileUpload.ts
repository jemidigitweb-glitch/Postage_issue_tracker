import type { MobileUploadTicket } from "./mobileAccess";
import type { UploadedAsset } from "./mobileSlots";

// Warehouse Mobile Lite — the BROWSER→CLOUDINARY upload boundary.
//
// No `server-only`, no `next/*`: this runs in the phone's browser. The bytes
// go straight from the device to Cloudinary and NEVER through a Server Action,
// a Route Handler, or any other Vercel Function request body — which is the
// whole point, because Vercel rejects any function request body over 4.5 MB
// (https://vercel.com/docs/functions/limitations) and one photo alone can
// exceed that.
//
// The application server only ever handles the small signing request and, in
// Stage 5, the small metadata registration.
//
// ── SIGNED, NEVER UNSIGNED ──────────────────────────────────────────────────
// The form carries the server-issued signature, timestamp and public_id. It
// carries `api_key`, which is Cloudinary's PUBLIC identifier, and never
// `api_secret`. `overwrite=false` is sent because the server signed it: the
// signature is only valid for exactly these parameters, so a caller cannot
// flip it to true, cannot point the upload at another path, and cannot widen
// the upload in any way.

/** Injectable so tests can drive the whole flow without a network or a real
 *  Cloudinary account. */
export type FetchLike = (input: string, init: { method: string; body: FormData }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  bytes?: number;
  format?: string;
  error?: { message?: string };
}

export class MobileUploadError extends Error {}

export function cloudinaryUploadUrl(ticket: MobileUploadTicket): string {
  return `https://api.cloudinary.com/v1_1/${ticket.cloudName}/${ticket.resourceType}/upload`;
}

/**
 * Uploads one file directly to Cloudinary using a server-issued ticket.
 *
 * Every signed parameter is echoed exactly as signed. The returned asset is
 * built ONLY from Cloudinary's own response — never from the local File — so
 * the recorded url, size and format are what actually landed in storage.
 *
 * Throws MobileUploadError on any failure; the caller marks the slot failed and
 * keeps the attemptId, so a retry reuses the same public_id.
 */
export async function uploadToCloudinary(
  ticket: MobileUploadTicket,
  file: Blob,
  fileName: string,
  fetchImpl: FetchLike
): Promise<UploadedAsset> {
  const form = new FormData();
  // Exactly the parameters the server signed, in the same values.
  form.append("public_id", ticket.publicId);
  form.append("overwrite", "false");
  form.append("timestamp", String(ticket.timestamp));
  // Not signed, per Cloudinary's contract — see lib/cloudinary.ts.
  form.append("api_key", ticket.apiKey);
  form.append("signature", ticket.signature);
  form.append("file", file, fileName);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(cloudinaryUploadUrl(ticket), { method: "POST", body: form });
  } catch {
    // A dropped warehouse connection is the expected case, not an exception to
    // surface raw.
    throw new MobileUploadError("Upload failed. Check your connection and try again.");
  }

  let payload: CloudinaryUploadResponse;
  try {
    payload = (await response.json()) as CloudinaryUploadResponse;
  } catch {
    throw new MobileUploadError("Upload failed. Please try again.");
  }

  if (!response.ok || !payload.secure_url || !payload.public_id) {
    throw new MobileUploadError("Upload failed. Please try again.");
  }

  return {
    publicId: payload.public_id,
    secureUrl: payload.secure_url,
    bytes: typeof payload.bytes === "number" ? payload.bytes : 0,
    format: typeof payload.format === "string" ? payload.format : "",
    resourceType: ticket.resourceType,
  };
}
