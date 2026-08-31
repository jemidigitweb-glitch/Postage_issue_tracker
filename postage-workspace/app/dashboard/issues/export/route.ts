import { getCurrentUserWithScope, isSuperAdmin } from "@/lib/auth";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";
import { buildXlsx, type XlsxCell } from "@/lib/export/xlsx";
import { listIssuesForExport } from "@/lib/queries/issues";
import { findRaiserForUser } from "@/lib/queries/raiserLink";
import { listStaff } from "@/lib/queries/staff";

// GET /dashboard/issues/export[?staff=<code>][&q=&category=&status=&priority=]
//
// "Download Issues" on the Issues page. Streams back one .xlsx containing
// EVERY Issue raised by ONE staff member that matches the filters currently
// applied on screen — pagination deliberately ignored.
//
// Read-only end to end: one SELECT (lib/queries/issues.ts listIssuesForExport)
// plus the lookup that names the file. No INSERT, UPDATE or DELETE is
// reachable from this route, and it touches nothing owned by the assignment,
// status, AI or Issue-creation/editing workflows.
//
// ── ACCESS ─────────────────────────────────────────────────────────────────
// Two roles, resolved by resolveExportTarget() below, and NOTHING else:
//
//   SUPER ADMIN (role 'admin')
//     Chooses the subject via ?staff=<code>, exactly as before. Unchanged.
//
//   RAISED BY STAFF (role 'raised_by')
//     Exports ONLY its own raised Issues. The staff_code comes from
//     findRaiserForUser(session userId) — the same account -> issue_staff link
//     that decides who an Issue is attributed to at creation time — and NEVER
//     from the request. A ?staff= naming anyone else is refused outright
//     rather than quietly ignored, so a tampered URL fails loudly instead of
//     appearing to work.
//
// The check is role-based, deliberately NOT hasPermission(user,
// "issue:view_all"): `raised_by` holds that permission too, and treating it as
// the gate would have handed the shared warehouse login a bulk download of the
// entire Issue base. Every other role (assignee 'staff', 'management',
// unlinked accounts) gets 403 and no file.
//
// The session-derived scope is still threaded into the query as well, so even
// if the role branch above were wrong the row filter would remain in force.
//
// Placed under /dashboard/issues/... on purpose: proxy.ts already protects
// that prefix, so an unauthenticated request is redirected to /login before it
// ever reaches this handler. "export" is a static segment and therefore wins
// over the sibling [issueId] dynamic segment; no real issue_id can collide
// with it (they are always "<staff_code>-<digits>").

// Reads cookies and queries per request — never prerendered, never cached.
export const dynamic = "force-dynamic";

/** Excel columns, in order. Every entry maps to exactly one field of
 *  IssueExportRow; nothing else in the row object reaches the file. */
const COLUMNS: Array<{ header: string; width: number }> = [
  { header: "Issue ID", width: 14 },
  { header: "Title", width: 44 },
  { header: "Raised By", width: 18 },
  { header: "Domain", width: 18 },
  { header: "Assigned To", width: 18 },
  { header: "Status", width: 10 },
  { header: "Priority", width: 12 },
  { header: "Date Raised", width: 14 },
  { header: "Description", width: 60 },
  { header: "Root Cause", width: 44 },
  { header: "Fix & Action Required", width: 44 },
  { header: "Implementation In Progress", width: 44 },
  { header: "Implementation Done", width: 44 },
  { header: "Final Resolution", width: 44 },
];

/** Filename-safe form of a staff name: "Atis Raj" -> "AtisRaj". Anything
 *  outside [A-Za-z0-9] is dropped, so the header can never be broken by a
 *  quote, semicolon, newline or path separator arriving from the database. */
function fileNameSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "") || "Staff";
}

/** Today's date in the app's display timezone (Asia/Colombo), as YYYY-MM-DD —
 *  the same calendar day the operator sees on screen, not the server's. */
function todayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Which staff member this request is allowed to export, or the refusal to
 *  send back. A `staffCode` only ever leaves this function after the caller's
 *  role has been shown to entitle them to it. */
type ExportTarget =
  | { ok: true; staffCode: string; staffName: string }
  | { ok: false; response: Response };

async function resolveExportTarget(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUserWithScope>>["user"]>,
  params: URLSearchParams
): Promise<ExportTarget> {
  const requestedStaffCode = (params.get("staff") ?? "").trim();

  // ── RAISED BY STAFF ──────────────────────────────────────────────────────
  // Checked BEFORE the Super Admin branch so there is no ordering in which a
  // `raised_by` request could fall through to the client-chosen ?staff= path.
  if (user.role === "raised_by") {
    const raiser = await findRaiserForUser(user.userId);
    // Not linked, or the linked issue_staff row was deactivated. There is no
    // fallback raiser to substitute — exporting "somebody's" Issues because
    // the real link is missing would be a fabrication.
    if (!raiser) {
      return {
        ok: false,
        response: new Response("This account is not linked to a Raised By staff member.", {
          status: 403,
        }),
      };
    }
    // A ?staff= naming anyone else is a tampering attempt, not a filter.
    // Refused explicitly rather than silently overwritten, so it cannot look
    // like it worked. (An echo of their OWN code is harmless and allowed.)
    if (requestedStaffCode && requestedStaffCode !== raiser.staffCode) {
      console.warn(
        `[dashboard/issues/export] user_id ${user.userId} (raised_by, staff_code "${raiser.staffCode}") requested staff_code "${requestedStaffCode}" — refused.`
      );
      return {
        ok: false,
        response: new Response("You may only download the Issues you raised.", { status: 403 }),
      };
    }
    return { ok: true, staffCode: raiser.staffCode, staffName: raiser.staffName };
  }

  // ── SUPER ADMIN ──────────────────────────────────────────────────────────
  // Unchanged from the original implementation.
  if (isSuperAdmin(user)) {
    // "Everyone / All Staff" is not an export. The button is disabled for it
    // in the UI; this is the enforcement.
    if (!requestedStaffCode) {
      return {
        ok: false,
        response: new Response("Select a staff member in Raised By before downloading.", {
          status: 400,
        }),
      };
    }
    // Resolve the display name for the filename, and confirm the code is real.
    // listStaff() is the same source the Raised By dropdown is built from, so
    // a code that is not in the dropdown is rejected rather than producing an
    // empty file named after nothing.
    const staff = await listStaff();
    const match = staff.find((s) => s.staffCode === requestedStaffCode);
    if (!match) {
      return { ok: false, response: new Response("Unknown staff member.", { status: 400 }) };
    }
    return { ok: true, staffCode: match.staffCode, staffName: match.staffName };
  }

  // Everyone else — assignee 'staff', 'management', anything added later.
  return { ok: false, response: new Response("Not permitted.", { status: 403 }) };
}

export async function GET(request: Request) {
  const { user, scope } = await getCurrentUserWithScope();

  if (!user) {
    return new Response("Not signed in.", { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  const target = await resolveExportTarget(user, params);
  if (!target.ok) {
    return target.response;
  }
  const { staffCode, staffName } = target;

  let result: Awaited<ReturnType<typeof listIssuesForExport>>;
  try {
    result = await listIssuesForExport(scope, {
      // Server-resolved above. For `raised_by` this is the session's own
      // linked staff_code and cannot be influenced by the request.
      staffCode,
      // Exactly the filters the Issues page reads from the URL, under the same
      // parameter names, so the export mirrors what is on screen.
      search: (params.get("q") ?? "").trim(),
      status: (params.get("status") ?? "").trim(),
      priority: (params.get("priority") ?? "").trim(),
      category: (params.get("category") ?? "").trim(),
      sort: (params.get("sort") ?? "").trim(),
      order: (params.get("order") ?? "").trim(),
    });
  } catch (error) {
    // Never surface the raw error (it can carry connection details).
    console.error("[dashboard/issues/export] failed to build export:", error);
    return new Response("Unable to build the export right now. Please try again shortly.", {
      status: 500,
    });
  }

  if (result.truncated) {
    console.warn(
      `[dashboard/issues/export] row cap reached for staff_code "${staffCode}" — file is truncated.`
    );
  }

  const rows: XlsxCell[][] = result.rows.map((row) => [
    row.issueId,
    row.title,
    row.raisedBy,
    row.domain,
    row.assignedTo,
    row.status,
    row.priority,
    row.dateRaised,
    row.description,
    row.rootCause,
    row.fixAndActionRequired,
    row.implementationInProgress,
    row.implementationDone,
    row.finalResolution,
  ]);

  const file = buildXlsx({
    sheetName: "Issues",
    headers: COLUMNS.map((c) => c.header),
    columnWidths: COLUMNS.map((c) => c.width),
    rows,
  });

  const fileName = `${fileNameSafe(staffName)}-Issues-${todayIsoDate()}.xlsx`;

  return new Response(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // fileNameSafe() guarantees the quoted value is [A-Za-z0-9-]+ plus the
      // date and extension, so no header injection is possible here.
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
      // Lets the browser-side download and any manual check confirm the export
      // covered the full filtered set, not just the visible page.
      "X-Export-Row-Count": String(result.rows.length),
      ...(result.truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}
