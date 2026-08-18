"use server";

import { getCurrentUser, hasPermission } from "@/lib/auth";
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
// CURRENT RULE: a real Issue Tracker session, resolved to a real user, holding
// the `mobile:submit` permission — which only `raised_by` and `admin` hold.
//
// SUPERSEDED TWICE, and both earlier designs are named here on purpose so the
// history is reviewable rather than guessed at:
//   1. An Issue Tracker session plus "issue:create_mobile" plus a username
//      allowlist. Dropped when the owner clarified that a warehouse worker had
//      no Tracker account at all.
//   2. An ANONYMOUS `wh_mobile` cookie minted by proxy.ts for any browser that
//      opened /mobile. It identified nobody. The owner has now provisioned a
//      shared "Raised by Staff" login, so that cookie and its two modules are
//      deleted and there is ONE authentication system again.
//
// The check is repeated here rather than inherited from the page: a direct
// request that never rendered /mobile is refused in exactly the same way.
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

/** Shown when there is no signed-in user, or they may not submit. A worker
 *  fixes it by signing in again. It reveals nothing about which check failed. */
const SESSION_EXPIRED = "Your session has expired. Sign in again and try again.";

export async function requestMobileUploadTicket(input: {
  submissionId: string;
  slot: string;
  attemptId: string;
}): Promise<MobileUploadTicketState> {
  // THE GATE: a real signed-in user holding mobile:submit. Re-checked here
  // and not inherited from the page — a direct request that never rendered
  // /mobile is refused exactly the same way.
  const user = await getCurrentUser();
  if (!user || !(await hasPermission(user, "mobile:submit"))) {
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
