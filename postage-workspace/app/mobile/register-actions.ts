"use server";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { isValidSubmissionId } from "@/lib/mobile/mobileAccess";
import {
  buildMobileDescription,
  buildMobileIssueTitleForItems,
  buildMobileTimelineExtraData,
  isAssetInSubmission,
  MOBILE_CATEGORY,
  verifyMobileTimeline,
  type MobileTimelineInput,
  type SubmittedAsset,
} from "@/lib/mobile/mobileRegistration";
import { findRaiserForUser } from "@/lib/queries/raiserLink";
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
// ── WHO RAISED IT: THE SIGNED-IN PERSON, RESOLVED SERVER-SIDE ───────────────
// SUPERSEDED: every Mobile Lite Issue used to be attributed to the generic
// WH / "Warehouse Mobile" row, because /mobile had no signed-in user to
// attribute it to. It does now. The raiser is resolved from the SESSION —
// management_users.user_id -> management_users.staff_code -> issue_staff — by
// findRaiserForUser(), which returns a row only if the account is linked AND
// that raiser is still active.
//
// The client sends no raiser and cannot. There is no form key, no input field
// and no code path that reads a staff code from the request, so a crafted
// request naming somebody else's code changes nothing: the value is looked up
// from the verified session id, and a request-supplied copy is never consulted
// because there is nowhere to put one.
//
// ── IT FAILS CLOSED, NEVER BACK TO WH ───────────────────────────────────────
// An account holding mobile:submit but with no linked raiser — or one whose
// raiser has been deactivated — is REFUSED. It does not fall back to WH, and
// it does not fall back to ND/SA/ST/NV/AT: an Issue attributed to the wrong
// person is worse than an Issue that was not created, because nobody can tell
// afterwards that it is wrong.
//
// WH itself is untouched. It keeps its issue_staff row and its historical
// Issues (WH-001 and any others) exactly as they are — this changes who NEW
// Issues are attributed to, and nothing else.
//
// ── SOURCE IS NOT RAISER ────────────────────────────────────────────────────
// extra_data.mobileSource still records "warehouse-mobile-lite", so an Issue
// still says where it came from. That is a different fact from who raised it:
// TestUser raising TU-001 from a phone is Raised By TestUser, source Warehouse
// Mobile Lite.

export interface MobileRegistrationState {
  issueId?: string;
  error?: string;
}

/** Shown when there is no signed-in user, or they may not submit. */
const SESSION_EXPIRED = "Your session has expired. Sign in again and try again.";
/** Shown when the account holds mobile:submit but is not linked to an active
 *  Issue raiser. Names no table and no column — it tells the worker who to ask,
 *  not how the system is wired. */
const NOT_SET_UP = "Your account is not set up to raise Issues yet. Please contact an administrator.";

export async function registerMobileIssue(input: {
  submissionId: string;
  /** The worker's report, in the order they built it. */
  items: MobileTimelineInput[];
  /** Assets replaced during this report. Cleaned up only after a successful
   *  registration, and only inside this submission's own namespace. */
  superseded?: SubmittedAsset[];
}): Promise<MobileRegistrationState> {
  // THE GATE: a real signed-in user holding mobile:submit. The ONE write this
  // feature performs is never reachable without it, whatever the browser sends.
  const user = await getCurrentUser();
  if (!user || !(await hasPermission(user, "mobile:submit"))) {
    return { error: SESSION_EXPIRED };
  }

  // WHO RAISED IT. Resolved from the verified session id, never from `input` —
  // there is deliberately no raiser field on this action's parameter type, so
  // there is nothing for a crafted request to set. A missing or deactivated
  // link refuses the submission rather than borrowing somebody else's identity.
  const raiser = await findRaiserForUser(user.userId);
  if (!raiser) {
    console.error(
      `[mobile] registration blocked — user ${user.userId} holds mobile:submit but has no active linked raiser`
    );
    return { error: NOT_SET_UP };
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
      // Server-derived, every one of them. staffCode comes from the session's
      // linked raiser resolved above — TU for TestUser — so the Issue ID it
      // produces through the existing next_issue_id() is TU-001, TU-002, ...
      staffCode: raiser.staffCode,
      // The worker's own first line, not a machine-made stamp. Falls back to
      // the stamp ONLY for a report with no typed text, because the database
      // refuses an empty title — and that stamp is blanked again at display
      // time, so it never reaches the Issue list or the detail page.
      title: buildMobileIssueTitleForItems(timeline.items, new Date()),
      // The one field the worker now authors — normalised and capped above.
      description: buildMobileDescription(timeline.items),
      category: MOBILE_CATEGORY,
      extraData: buildMobileTimelineExtraData(input.submissionId, timeline.items),
    });
    issueId = result.issueId;
  } catch (error) {
    if (error instanceof InvalidStaffError) {
      // Belt and braces: findRaiserForUser() has already established that the
      // raiser exists and is active, so reaching here means it changed between
      // that lookup and the transaction. Still no fallback — the submission is
      // refused rather than re-attributed.
      console.error("[mobile] registration blocked — linked raiser rejected:", error.message);
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
