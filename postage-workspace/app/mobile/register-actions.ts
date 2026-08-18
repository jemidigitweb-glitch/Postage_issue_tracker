"use server";

import { readMobileSession } from "@/lib/mobile/mobileSession";
import { isValidSubmissionId } from "@/lib/mobile/mobileAccess";
import {
  buildMobileDescription,
  buildMobileIssueTitle,
  buildMobileTimelineExtraData,
  isAssetInSubmission,
  MOBILE_CATEGORY,
  MOBILE_STAFF_CODE,
  verifyMobileTimeline,
  type MobileTimelineInput,
  type SubmittedAsset,
} from "@/lib/mobile/mobileRegistration";
import { createMobileIssue } from "@/lib/queries/issues";
import { InvalidStaffError } from "@/lib/queries/issues";
import { deleteAttachments } from "@/lib/cloudinary";
import type { StoredAttachment } from "@/lib/access/attachments";

// WAREHOUSE MOBILE LITE — registration.
//
// The ONE write this feature performs. It is a metadata-only action: the
// media is already in Cloudinary, uploaded directly by the browser, so the
// request body here is a few hundred bytes and never approaches Vercel's
// 4.5 MB function limit.
//
// ── WHAT THE CLIENT MAY DECIDE ──────────────────────────────────────────────
// STAGE 2: the ordered list of items it built — its own text, its own photo
// captions, and which assets it uploaded under which submission id. It still
// cannot choose the Raised By code, the Domain, the status, the Issue ID, the
// timestamps or the title: every one of those is derived here or by the
// database, and no form key for them is ever read. The description is now
// COMPOSED from the worker's own text and captions, after normalisation.
//
// ── WHY IT CAN FAIL CLEANLY WITH NO REPORTER ────────────────────────────────
// The Warehouse Mobile reporter row (staff_code "WH") is created by a Super
// Admin through the existing Add Staff page, pending owner approval. Until it
// exists, createIssueTx() raises InvalidStaffError and this action reports a
// setup problem. It NEVER falls back to ND/SA/ST/NV or any other staff code —
// a Mobile Lite Issue attributed to a real person would be a fabrication.

export interface MobileRegistrationState {
  issueId?: string;
  error?: string;
}

/** Shown when the anonymous session is missing or expired. */
const SESSION_EXPIRED = "This session has expired. Reload the page and try again.";
/** Shown when the WH reporter row does not exist yet. Names no table. */
const NOT_SET_UP = "Warehouse Mobile is not set up yet. Please contact an administrator.";

export async function registerMobileIssue(input: {
  submissionId: string;
  /** The worker's report, in the order they built it. */
  items: MobileTimelineInput[];
  /** Assets replaced during this report. Cleaned up only after a successful
   *  registration, and only inside this submission's own namespace. */
  superseded?: SubmittedAsset[];
}): Promise<MobileRegistrationState> {
  const session = await readMobileSession();
  if (!session) {
    return { error: SESSION_EXPIRED };
  }

  if (!isValidSubmissionId(input.submissionId)) {
    return { error: "Invalid submission." };
  }

  // STAGE 2 BOUNDARY. Item kinds, ids, slot range, the 10-photo and 1-voice
  // caps, duplicate slots and duplicate assets, text and caption normalisation,
  // and the "at least one meaningful item" rule are all decided HERE — never by
  // the client. Every asset still passes the same namespace, slot, resource
  // type, format and size check Stage 1 applied, so an arbitrary Cloudinary
  // asset still cannot be attached.
  const timeline = verifyMobileTimeline(input.submissionId, input.items);
  if (!timeline.ok) {
    return { error: timeline.error };
  }

  let issueId: string;
  try {
    const result = await createMobileIssue({
      submissionId: input.submissionId,
      // Server-derived, every one of them.
      staffCode: MOBILE_STAFF_CODE,
      title: buildMobileIssueTitle(new Date()),
      // The one field the worker now authors — normalised and capped above.
      description: buildMobileDescription(timeline.items),
      category: MOBILE_CATEGORY,
      extraData: buildMobileTimelineExtraData(input.submissionId, timeline.items),
    });
    issueId = result.issueId;
  } catch (error) {
    if (error instanceof InvalidStaffError) {
      // The reporter row has not been provisioned yet. No fallback.
      console.error("[mobile] registration blocked — reporter not provisioned:", error.message);
      return { error: NOT_SET_UP };
    }
    // Never surface the raw error: it can carry connection details. The media
    // is deliberately LEFT IN PLACE so the worker can simply press REGISTER
    // again without re-recording or re-photographing anything.
    console.error("[mobile] registration failed:", error);
    return { error: "Could not register this report. Please try again." };
  }

  // ── Cleanup, only after a successful commit ──────────────────────────────
  // Superseded assets are the ones a deliberate re-record or retake replaced.
  // Each candidate is re-checked against THIS submission's namespace before it
  // is deleted, so this can never reach another submission, a desktop upload,
  // or a historical Issue's evidence. The ACTIVE assets are never included.
  // Failure here is logged and ignored — it costs storage, never correctness.
  const removable = (input.superseded ?? []).filter((asset) =>
    isAssetInSubmission(asset.publicId, input.submissionId)
  );
  if (removable.length > 0) {
    const targets: StoredAttachment[] = removable.map((asset) => ({
      type: asset.resourceType === "video" ? "audio" : "image",
      url: asset.secureUrl,
      public_id: asset.publicId,
      original_name: "superseded",
      mime_type: "",
      source: "upload",
      bytes: asset.bytes,
    }));
    await deleteAttachments(targets);
  }

  return { issueId };
}
