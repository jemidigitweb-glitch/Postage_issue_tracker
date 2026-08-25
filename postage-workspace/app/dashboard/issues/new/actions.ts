"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { isIssuesOnlyRole } from "@/lib/access/raisedByAccess";
import { findRaiserForUser } from "@/lib/queries/raiserLink";
import { createIssue, InvalidStaffError, type IssuePriority } from "@/lib/queries/issues";
import {
  validateFile,
  validateFileCount,
  type AttachmentKind,
  type AttachmentSource,
  type StoredAttachment,
  type StoredImage,
} from "@/lib/access/attachments";
import {
  deleteAttachments,
  isAttachmentStorageConfigured,
  uploadAttachment,
} from "@/lib/cloudinary";

export interface NewIssueState {
  error?: string;
}

const VALID_PRIORITIES: readonly IssuePriority[] = ["critical", "high", "medium", "low"];

/** Upper bound on any single free-text field. The columns are TEXT, so this is
 *  a guard against a multi-megabyte paste, not a schema requirement. */
const MAX_TEXT = 20_000;
/** Shorter fields that map to VARCHAR-ish concepts or single-line inputs. */
const MAX_SHORT_TEXT = 200;

/**
 * The extra_data keys this form writes.
 *
 * EVERY one is justified by the live-data audit — a recurring key that carries
 * user-authored CONTENT and is already rendered on the Issue detail page:
 *   member          114/145 rows — its own field on the detail page
 *   rootCause       100/145 rows — rendered on the Assigned Issues card
 *   whatIsHappening  64/145 rows — rendered on the Assigned Issues card
 *   sku              18/145 rows — product code, e.g. "WCSN2BM"
 *   dataLink          6/145 rows — rendered as the "View Data" capsule
 *
 * Deliberately NOT written by this form, despite existing in extra_data:
 *   sourceFile / sourceId / originalOwner (52, always together)
 *   evidenceStatus / knownLimits / sourceFidelity / sourceType (30, always
 *     together — e.g. "TRANSCRIBED FROM HANDWRITING")
 *   classification / evidenceFiles (22, always together)
 *   domainConfidence (24 — commentary on an automatic classification)
 *   documentGap (32 — values are generated filenames like "gap-018-….md")
 *   originalPriority (3 — a pre-normalisation historical value)
 * Those are all ingestion-pipeline provenance, not something a person types
 * when raising an Issue. Five of them are ALREADY hidden by
 * components/issues/IssueDetail.tsx's HIDDEN_META_KEYS, which is the existing
 * codebase agreeing with this reading.
 */
const EXTRA_TEXT_FIELDS = [
  { formKey: "member", extraKey: "member", max: MAX_SHORT_TEXT },
  { formKey: "sku", extraKey: "sku", max: MAX_SHORT_TEXT },
  { formKey: "dataLink", extraKey: "dataLink", max: MAX_SHORT_TEXT },
  { formKey: "whatIsHappening", extraKey: "whatIsHappening", max: MAX_TEXT },
  { formKey: "rootCause", extraKey: "rootCause", max: MAX_TEXT },
] as const;

function readText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Only http(s) — a `javascript:` or `data:` value must never reach an href.
 *  Empty is allowed (the field is optional); anything else non-http fails. */
function isAcceptableLink(value: string): boolean {
  if (!value) return true;
  return /^https?:\/\/\S+$/i.test(value);
}

/** Pulls the real File entries for a field, skipping the empty placeholder a
 *  browser sends for an untouched file input. */
function readFiles(formData: FormData, key: string): File[] {
  return formData
    .getAll(key)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

interface PreparedFile {
  kind: AttachmentKind;
  source: AttachmentSource;
  originalName: string;
  declaredType: string;
  bytes: Uint8Array;
}

/**
 * Reads every file into memory and validates it AGAINST ITS BYTES.
 *
 * Returns an error string on the first failure so the user is told exactly
 * which file was rejected and why. Nothing is uploaded until every file has
 * passed — a submission is all-or-nothing, so evidence is never partially
 * attached.
 */
async function prepareFiles(
  files: File[],
  kind: AttachmentKind,
  source: AttachmentSource
): Promise<{ ok: true; files: PreparedFile[] } | { ok: false; error: string }> {
  const prepared: PreparedFile[] = [];

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateFile(kind, {
      name: file.name,
      declaredType: file.type,
      size: bytes.byteLength,
      // 16 bytes covers every signature the sniffer knows.
      head: bytes.subarray(0, 16),
    });
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    prepared.push({
      kind,
      source,
      originalName: file.name,
      declaredType: file.type,
      bytes,
    });
  }

  return { ok: true, files: prepared };
}

/**
 * Creates one Issue, with optional JPEG and audio evidence.
 *
 * ── AUTHORIZATION ───────────────────────────────────────────────────────────
 * Requires an authenticated session plus `issue:create`, which the Super Admin
 * (role 'admin') and 'management' hold and the Assignee role ('staff') does
 * NOT. Resolved from the session — never from the form.
 *
 * ── WHAT THE USER MAY SET ───────────────────────────────────────────────────
 * Raised By (issue_staff.staff_code), Title, Domain, Priority, Description,
 * Fix & Action Required, and the five audited extra_data content fields.
 *
 * System-generated values are NOT accepted from the form and cannot be
 * overridden by adding a field to it: the Issue ID still comes from
 * issue_tracking.next_issue_id() inside createIssue()'s transaction, the
 * status is still hard-coded 'RED' there, and created_date/created_at/
 * updated_at are still database defaults. This action never reads a form key
 * for any of them.
 *
 * ── FAILURE BEHAVIOUR (documented, deliberate) ──────────────────────────────
 *   1. validate every text field            — nothing uploaded, nothing created
 *   2. validate every file, by its BYTES    — nothing uploaded, nothing created
 *   3. upload all attachments               — any failure aborts; already-
 *                                             uploaded files are deleted again
 *   4. create the Issue in one transaction  — if this fails, every uploaded
 *                                             asset is deleted (best effort)
 *                                             and the error is reported
 *
 * The ordering is what guarantees the two things that matter: an Issue is
 * never created with silently-missing evidence, and a failed submission does
 * not leave a half-complete Issue behind. Orphaned storage is the one residual
 * risk, and it is handled by an explicit best-effort cleanup that is logged if
 * it cannot complete — storage cost, never data corruption.
 */
export async function createIssueAction(
  _prevState: NewIssueState,
  formData: FormData
): Promise<NewIssueState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to create issues." };
  }
  if (!(await hasPermission(user, "issue:create"))) {
    return { error: "You do not have permission to create issues." };
  }

  // ── 0. WHO IS RAISING THIS ────────────────────────────────────────────────
  // Two kinds of author, and they are not treated the same:
  //
  //   SELF-RAISER (role raised_by) — files Issues AS THEMSELVES. The raiser is
  //     resolved from the verified session through their linked issue_staff row
  //     and the form key is NEVER read for them, so a crafted submission naming
  //     another staff code has nothing to act on. If the link is missing or the
  //     raiser was deactivated, the submission is refused — never reassigned to
  //     WH or to anyone else.
  //
  //   ON-BEHALF AUTHOR (Super Admin / management) — files Issues for other
  //     people, so they pick the raiser from the form exactly as before. This
  //     branch is byte-for-byte the previous behaviour.
  const selfRaiser = isIssuesOnlyRole(user.role);

  let staffCode: string;
  if (selfRaiser) {
    const raiser = await findRaiserForUser(user.userId);
    if (!raiser) {
      console.error(
        `[issues/new] blocked — user ${user.userId} may create Issues but has no active linked raiser`
      );
      return {
        error:
          "Your account is not set up to raise Issues yet. Please contact an administrator.",
      };
    }
    staffCode = raiser.staffCode;
  } else {
    staffCode = readText(formData, "staffCode");
  }

  // ── 1. Text fields ────────────────────────────────────────────────────────
  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const category = readText(formData, "category");
  const priorityRaw = readText(formData, "priority");
  // Fix & Action Required is a RESOLUTION field. A self-raiser reports the
  // problem; deciding the fix is management work they hold no permission for,
  // so the key is not read for them at all — hiding the input is presentation,
  // this is the guard.
  const resolution = selfRaiser ? "" : readText(formData, "resolution");

  if (!staffCode || !title || !description || !category) {
    return { error: "Raised By, Title, Domain, and Description are all required." };
  }
  if (title.length > MAX_SHORT_TEXT) {
    return { error: `Title must be ${MAX_SHORT_TEXT} characters or fewer.` };
  }
  if (category.length > 50) {
    return { error: "Domain must be 50 characters or fewer." };
  }
  if (description.length > MAX_TEXT || resolution.length > MAX_TEXT) {
    return { error: "Description and Fix & Action Required must be 20,000 characters or fewer." };
  }

  const priority = VALID_PRIORITIES.includes(priorityRaw as IssuePriority)
    ? (priorityRaw as IssuePriority)
    : null;

  const extraData: Record<string, unknown> = {};
  for (const field of EXTRA_TEXT_FIELDS) {
    // Root Cause is investigation content, which a self-raiser has no
    // permission to author. Skipped server-side, not merely hidden.
    if (selfRaiser && field.formKey === "rootCause") continue;
    const value = readText(formData, field.formKey);
    if (!value) continue;
    if (value.length > field.max) {
      return { error: `${field.formKey} must be ${field.max} characters or fewer.` };
    }
    extraData[field.extraKey] = value;
  }
  if (!isAcceptableLink(String(extraData.dataLink ?? ""))) {
    return { error: "Data Link must be a full http:// or https:// URL." };
  }

  // ── 2. Files, validated by their bytes ────────────────────────────────────
  const imageFiles = readFiles(formData, "imageFiles");
  const audioFiles = readFiles(formData, "audioFiles");
  const recordingFiles = readFiles(formData, "voiceRecording");

  const imageCount = validateFileCount("image", imageFiles.length);
  if (!imageCount.ok) return { error: imageCount.error };
  const audioCount = validateFileCount("audio", audioFiles.length + recordingFiles.length);
  if (!audioCount.ok) return { error: audioCount.error };

  const hasAttachments =
    imageFiles.length + audioFiles.length + recordingFiles.length > 0;
  if (hasAttachments && !isAttachmentStorageConfigured()) {
    // Fail BEFORE creating anything, so the user is not told the Issue was
    // saved while their evidence silently vanished.
    return {
      error:
        "Attachment storage is not configured on the server, so evidence cannot be saved. " +
        "Remove the attachments to create the Issue without them, or contact an administrator.",
    };
  }

  const preparedImages = await prepareFiles(imageFiles, "image", "upload");
  if (!preparedImages.ok) return { error: preparedImages.error };
  const preparedAudio = await prepareFiles(audioFiles, "audio", "upload");
  if (!preparedAudio.ok) return { error: preparedAudio.error };
  const preparedRecordings = await prepareFiles(recordingFiles, "audio", "voice_recording");
  if (!preparedRecordings.ok) return { error: preparedRecordings.error };

  const allFiles = [...preparedImages.files, ...preparedAudio.files, ...preparedRecordings.files];

  // ── 3. Upload ─────────────────────────────────────────────────────────────
  const uploaded: StoredAttachment[] = [];
  for (const file of allFiles) {
    try {
      uploaded.push(await uploadAttachment(file));
    } catch (error) {
      // Roll back what already went up, so a retry does not accumulate copies.
      await deleteAttachments(uploaded);
      const message =
        error instanceof Error ? error.message : "Could not upload the attachments.";
      return { error: message };
    }
  }

  if (uploaded.length > 0) {
    // BACKWARD COMPATIBLE: images are ALSO written to extra_data.images in
    // exactly the three-key shape the 64 historical images use, so
    // components/issues/IssueDetail.tsx's existing gallery renders them with
    // no change. `attachments` is a NEW, additive key (0 of 145 historical
    // Issues have it) carrying the richer record including audio.
    const images: StoredImage[] = uploaded
      .filter((attachment) => attachment.type === "image")
      .map((attachment) => ({
        url: attachment.url,
        public_id: attachment.public_id,
        original_name: attachment.original_name,
      }));

    if (images.length > 0) {
      extraData.images = images;
    }
    extraData.attachments = uploaded;
  }

  // ── 4. Create ─────────────────────────────────────────────────────────────
  let issueId: string;
  try {
    issueId = await createIssue({
      staffCode,
      title,
      description,
      category,
      priority,
      // Written to issues.resolution — the historical "Fix & Action Required".
      // NOT final_resolution, which is the Stage 6 completion outcome and is
      // only ever written by the work-progress workflow.
      resolution: resolution || null,
      extraData,
    });
  } catch (error) {
    await deleteAttachments(uploaded);
    if (error instanceof InvalidStaffError) {
      return { error: error.message };
    }
    console.error("[dashboard/issues/new] failed to create issue:", error);
    return { error: "Could not save this issue. Please try again." };
  }

  revalidatePath("/dashboard/issues");
  redirect(`/dashboard/issues/${issueId}`);
}
