"use server";

import { getCurrentUser, getIssueAccessScope, hasPermission } from "@/lib/auth";
import { sanitizeIssueForAi } from "@/lib/access/aiSanitization";
import { getIssueById, isValidIssueId } from "@/lib/queries/issues";
import { getGeminiFeatureStatus } from "@/lib/ai/geminiConfig";
import { sendAnalysisRequest } from "@/lib/ai/geminiClient";
import { runIssueAnalysis, type AnalysisOutcome } from "@/lib/ai/analysisFlow";

// ASSIGNEE PORTAL — the "Analyse with AI" Server Action.
//
// ── OWNERSHIP ───────────────────────────────────────────────────────────────
// The caller's assignee identity comes ONLY from the signed session cookie:
//   session -> management_users.user_id
//           -> assignment_users.user_id      (findAssigneeIdForUser)
//           -> assignment_users.assignee_id
//           -> issue_assignments.assignee_id WHERE is_current = true
// The last step is enforced IN SQL by getIssueById()'s scope predicate, so an
// Issue that is not currently assigned to this caller comes back as null and
// is indistinguishable from one that does not exist.
//
// No assignee id, user id or role is ever read from the form. Only two fields
// are taken from the request: `issueId`, which is shape-checked and then used
// solely as a bind parameter to an ownership-filtered lookup, and `runId`, an
// opaque digits-only token echoed straight back so the browser can discard a
// reply to a run the user abandoned. Neither influences authorization, so
// changing the URL or the payload cannot reach another Assignee's Issue, and a
// superseded (is_current = false) assignment authorizes nothing.
//
// issue_tracking.issue_staff / "Raised By" is never consulted for ownership.
//
// ── NO WRITES ───────────────────────────────────────────────────────────────
// This action performs SELECTs only. It does not import issueStatus.ts or the
// write helpers in issueWorkProgress.ts, and it does not call revalidatePath()
// — nothing changed, so there is nothing to revalidate. AI output is advisory:
// it never sets a status, a priority, an assignment, implementation progress,
// a final resolution, a comment, or any history row.
//
// ── FREE-TIER GATE ──────────────────────────────────────────────────────────
// runIssueAnalysis() checks enabled / configured / allowRealIssueData BEFORE
// building a prompt. While GEMINI_ALLOW_REAL_ISSUE_DATA is false it returns
// AI_REAL_DATA_BLOCKED without assembling any Issue text and without calling
// the sender, so no real Issue content leaves this process.

export interface AnalyseIssueState {
  outcome?: AnalysisOutcome;
  /** Set only for authorization/input failures, which never reach the flow. */
  error?: string;
  /** Echo of the client's request id, so the panel can tell WHICH run a reply
   *  belongs to and discard one the user abandoned by switching the toggle
   *  off. It is compared and nothing else — never trusted, never used for
   *  authorization, and it takes no part in any query. */
  runId?: string;
}

/** Identical wording whether the Issue belongs to someone else or does not
 *  exist — never confirm the existence of another Assignee's Issue. */
const NOT_YOURS = "Issue not found or not assigned to you.";

export async function analyseIssueAction(
  _prevState: AnalyseIssueState,
  formData: FormData
): Promise<AnalyseIssueState> {
  // Opaque correlation token, echoed on every return path. Capped and
  // stripped to digits so nothing else can ride along in it.
  const runId = String(formData.get("runId") ?? "").replace(/[^0-9]/g, "").slice(0, 12);

  const user = await getCurrentUser();
  if (!user) {
    return { runId, error: "You must be signed in to use AI assistance." };
  }

  // TWO permissions, checked separately. `management` holds neither and is
  // refused here even though it can view Issues.
  const [canAnalyseAny, canAnalyseOwn] = await Promise.all([
    hasPermission(user, "issue:analyse_any"),
    hasPermission(user, "issue:analyse_own_assigned"),
  ]);
  if (!canAnalyseAny && !canAnalyseOwn) {
    return { runId, error: "You do not have permission to use AI assistance." };
  }

  // The scope does the rest. For a Super Admin it resolves to "all", so no
  // assignment ownership is required; for an Assignee it resolves to
  // "assignee", and getIssueById() then requires a CURRENT assignment in SQL.
  // Neither path reads an identity from the request.
  const scope = await getIssueAccessScope(user);
  if (canAnalyseAny) {
    if (scope.kind !== "all") {
      return { runId, error: NOT_YOURS };
    }
  } else if (scope.kind !== "assignee") {
    // Holds the assignee permission but has no assignee identity (unlinked
    // account). Fail closed rather than falling through to a wider read.
    return { runId, error: NOT_YOURS };
  }

  const issueId = String(formData.get("issueId") ?? "").trim();
  if (!isValidIssueId(issueId)) {
    return { runId, error: "Invalid issue." };
  }

  try {
    // Scope-filtered: null unless this Issue is CURRENTLY assigned to the
    // session's assignee.
    const issue = await getIssueById(issueId, scope);
    if (!issue) {
      return { runId, error: NOT_YOURS };
    }

    // Only sanitized content may go further. The sanitizer builds a new object
    // from a FOUR-field allow-list — title, description, domain and the
    // reported root cause; the raw row stops here.
    //
    // No other Issue is read. There is no historical, resolved or similar-Issue
    // retrieval on this path or on the page-render path, so an analysis costs
    // exactly one Issue lookup.
    const sanitizedIssue = sanitizeIssueForAi(issue);

    const outcome = await runIssueAnalysis(
      getGeminiFeatureStatus(),
      { issue: sanitizedIssue },
      sendAnalysisRequest
    );

    return { runId, outcome };
  } catch (error) {
    // Never surface the raw error: it can carry connection details.
    console.error(`[dashboard/issues] AI analysis failed for ${issueId}:`, error);
    return { runId, error: "Could not complete the analysis. Please try again." };
  }
}
