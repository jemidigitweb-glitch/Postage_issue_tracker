"use server";

import { readMobileSession } from "@/lib/mobile/mobileSession";
import {
  buildMobilePublicId,
  buildMobileUploadTicket,
  isMobileUploadSlot,
  isValidAttemptId,
  isValidSubmissionId,
  resourceTypeForSlot,
  type MobileUploadTicket,
} from "@/lib/mobile/mobileAccess";
import { createSignedUploadParams, isAttachmentStorageConfigured } from "@/lib/cloudinary";

// WAREHOUSE MOBILE LITE — the signed-upload foundation.
//
// This action mints the parameters a phone needs to upload ONE file directly to
// Cloudinary. It uploads nothing itself, creates no Issue, and touches no
// database: Stage 3 builds only the foundation, and the capture UI (Stage 4)
// and registration (Stage 5) come later.
//
// ── WHAT GUARDS THIS ────────────────────────────────────────────────────────
// SUPERSEDED: an earlier revision required an Issue Tracker session, the
// "issue:create_mobile" permission and a username allowlist. The owner
// clarified that /mobile must work while the Tracker is logged out, so this
// action now requires the ANONYMOUS Mobile Lite session instead — the signed,
// httpOnly cookie proxy.ts issues when a browser opens /mobile.
//
// That cookie identifies nobody and grants nothing. What it buys is that this
// endpoint is not open to the world: a caller must be a browser that actually
// visited /mobile and holds a currently-valid, signature-verified token. A
// Tracker session cookie cannot satisfy it (different cookie name, and the
// verifier rejects any token carrying a userId), and this cookie cannot reach
// /dashboard — its Path is /mobile.
//
// Hiding a control in the UI is never the guard; this is.
//
// ── WHY THE CLIENT CANNOT CHOOSE WHERE IT WRITES ────────────────────────────
// The caller sends a submission id and one of three fixed slot names. The
// public_id is composed HERE, from the validated pair, by
// buildMobilePublicId(). A signature is therefore usable for exactly one path,
// and a later registration action can recompute the expected value and compare
// it — so an asset belonging to another submission, another worker, or an
// existing Issue can never be attached.

export interface MobileUploadTicketState {
  ticket?: MobileUploadTicket;
  error?: string;
}

/** Shown when the anonymous session is missing, expired or invalid — a worker
 *  fixes it by reloading /mobile, which mints a fresh one. It reveals nothing
 *  about why. */
const SESSION_EXPIRED = "This session has expired. Reload the page and try again.";

export async function requestMobileUploadTicket(input: {
  submissionId: string;
  slot: string;
  attemptId: string;
}): Promise<MobileUploadTicketState> {
  // The ONLY gate: a valid anonymous Mobile Lite session. No Tracker login, no
  // account, no permission, no allowlist.
  const session = await readMobileSession();
  if (!session) {
    return { error: SESSION_EXPIRED };
  }

  if (!isValidSubmissionId(input.submissionId)) {
    return { error: "Invalid submission." };
  }
  if (!isMobileUploadSlot(input.slot)) {
    return { error: "Invalid upload slot." };
  }
  // The attempt segment is what makes a deliberate replacement land on a NEW
  // path while a retry reuses the old one — see buildMobilePublicId().
  if (!isValidAttemptId(input.attemptId)) {
    return { error: "Invalid attempt." };
  }

  if (!isAttachmentStorageConfigured()) {
    // Fail before signing, so a worker is never handed a ticket that cannot
    // work. Names no variable and no value.
    return { error: "Evidence storage is not configured. Contact an administrator." };
  }

  const resourceType = resourceTypeForSlot(input.slot);

  try {
    const params = createSignedUploadParams({
      // Server-composed. The client's only influence is which of three slots,
      // and two UUIDs it cannot use to escape the folder.
      publicId: buildMobilePublicId(input.submissionId, input.slot, input.attemptId),
      resourceType,
    });

    // Rebuilt field by field — never spread — so nothing from the signing
    // layer can widen what reaches the browser.
    return {
      ticket: buildMobileUploadTicket({
        cloudName: params.cloudName,
        apiKey: params.apiKey,
        timestamp: params.timestamp,
        signature: params.signature,
        publicId: params.publicId,
        resourceType: params.resourceType,
      }),
    };
  } catch (error) {
    // Never surface the raw error: it can carry configuration detail.
    console.error("[mobile] could not create an upload ticket:", error);
    return { error: "Could not prepare the upload. Please try again." };
  }
}
