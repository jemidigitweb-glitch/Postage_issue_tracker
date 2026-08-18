import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { permissionsForRole, roleHasPermission } from "../lib/access/permissions";
import {
  MOBILE_SOURCE_KEY,
  MOBILE_SOURCE_VALUE,
  MOBILE_STAFF_CODE,
  MOBILE_SUBMISSION_KEY,
} from "../lib/mobile/mobileRegistration";

// RAISED-BY-STAFF ↔ ISSUE RAISER LINK — preparation stage.
//
// The link itself is NOT implemented yet: migration 014 is prepared but not
// applied, no account is linked, and Mobile Lite still raises as WH. This file
// therefore does two things, and deliberately not a third:
//
//   1. PINS what must survive the change. Every assertion here describes
//      today's behaviour that the linking work must not break — the raiser
//      source, the ID generator, the source metadata, the untouched roles.
//   2. PINS the prepared migration's safety properties, so a later edit cannot
//      quietly turn 014 into something that links accounts or invents a
//      staff_code.
//
// It does NOT assert the future behaviour (server-derived raiser on /mobile),
// because that code does not exist yet and a test that fails by design is
// worse than no test. Those assertions land with the implementation.

const workspace = process.cwd();
const repoRoot = resolve(workspace, "..");

function source(relativePath: string): string {
  return readFileSync(join(workspace, relativePath), "utf8");
}

function migration(name: string): string {
  return readFileSync(join(repoRoot, "migration", name), "utf8");
}

/** SQL with comment lines removed — the files document what they must not do,
 *  so "must not appear" assertions have to look at statements, not prose. */
function sqlOnly(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/** TypeScript with comment lines removed, for the same reason. */
function codeOnly(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// What the Raised By filter is built from
// ---------------------------------------------------------------------------

describe("Raised By comes from issue_staff — never from management_users", () => {
  const staffQueries = source("lib/queries/staff.ts");

  it("the filter list is issue_staff, all rows, ordered by name", () => {
    assert.ok(staffQueries.includes("export async function listStaff"));
    assert.ok(staffQueries.includes("FROM issue_tracking.issue_staff"));
    // Inactive raisers stay listed: historical Issues still reference them.
    assert.ok(staffQueries.includes("ORDER BY staff_name"));
  });

  it("the New Issue raiser dropdown is ACTIVE issue_staff only", () => {
    assert.ok(staffQueries.includes("export async function listActiveStaff"));
    assert.ok(staffQueries.includes("WHERE active = true"));
  });

  it("neither list reads management_users, so a login is never a raiser by itself", () => {
    assert.equal(
      staffQueries.includes("management_users"),
      false,
      "an arbitrary login account must not appear in the Raised By filter"
    );
  });

  it("the Issue list page populates the filter from listStaff", () => {
    const page = source("app/dashboard/issues/page.tsx");
    assert.ok(page.includes('from "@/lib/queries/staff"'));
    assert.ok(page.includes("listStaff()"));
  });

  it("the New Issue page populates its dropdown from listActiveStaff", () => {
    const page = source("app/dashboard/issues/new/page.tsx");
    assert.ok(page.includes("listActiveStaff()"));
  });

  it("existing raisers are created only through the guarded Add Staff flow", () => {
    const addStaff = source("app/dashboard/issues/add-staff/actions.ts");
    assert.ok(addStaff.includes('hasPermission(user, "user:manage")'));
    assert.ok(addStaff.includes("createStaff({ staffCode, staffName, active })"));
    // INSERT-only: an existing raiser is never overwritten.
    assert.ok(staffQueries.includes("INSERT INTO issue_tracking.issue_staff"));
    assert.equal(staffQueries.includes("UPDATE issue_tracking.issue_staff"), false);
    assert.equal(staffQueries.includes("DELETE FROM issue_tracking.issue_staff"), false);
  });
});

// ---------------------------------------------------------------------------
// Issue ID generation — one numbering system, driven by staff_code
// ---------------------------------------------------------------------------

describe("Issue IDs still come from the one concurrency-safe generator", () => {
  const issues = source("lib/queries/issues.ts");

  it("allocates through issue_tracking.next_issue_id(staff_code)", () => {
    assert.ok(issues.includes("SELECT issue_tracking.next_issue_id($1) AS next_issue_id"));
  });

  it("validates the raiser against issue_staff before allocating a number", () => {
    assert.ok(issues.includes("SELECT active FROM issue_tracking.issue_staff WHERE staff_code = $1"));
    assert.ok(issues.includes("InvalidStaffError"));
    // The order matters: an unknown code must fail as a clear error, not as an
    // opaque FK violation after a number has been burned.
    assert.ok(
      issues.indexOf("FROM issue_tracking.issue_staff WHERE staff_code = $1") <
        issues.indexOf("next_issue_id($1)")
    );
  });

  it("introduces no second numbering scheme", () => {
    for (const forbidden of ["nextval(", "uuid_generate", "gen_random_uuid", "Math.random"]) {
      assert.equal(issues.includes(forbidden), false, `Issue IDs must not use ${forbidden}`);
    }
  });

  it("the mobile path reuses the same statements rather than copying them", () => {
    assert.ok(issues.includes("export async function createIssueTx"));
    assert.ok(issues.includes("await createIssueTx(client,"));
    // The raiser is a PARAMETER of the shared path, which is why linking a real
    // raiser later needs no change to the query layer at all.
    assert.ok(issues.includes("staffCode: input.staffCode"));
  });
});

// ---------------------------------------------------------------------------
// Warehouse Mobile — today's behaviour, and what must outlive the change
// ---------------------------------------------------------------------------

describe("Warehouse Mobile source metadata is independent of the raiser", () => {
  it("records mobileSource separately from staff_code", () => {
    assert.equal(MOBILE_SOURCE_KEY, "mobileSource");
    assert.equal(MOBILE_SOURCE_VALUE, "warehouse-mobile-lite");
    assert.equal(MOBILE_SUBMISSION_KEY, "mobileSubmissionId");
  });

  it("writes the source into extra_data, not into the raiser field", () => {
    const registration = source("lib/mobile/mobileRegistration.ts");
    assert.ok(registration.includes("[MOBILE_SOURCE_KEY]: MOBILE_SOURCE_VALUE"));
    // Changing who raises the Issue therefore cannot lose the fact that it came
    // from Mobile Lite — the two live in different places by construction.
    assert.ok(registration.includes("[MOBILE_SUBMISSION_KEY]: submissionId"));
  });

  it("WH is no longer the raiser for a new authenticated submission", () => {
    const action = source("app/mobile/register-actions.ts");
    // The constant survives for the historical rows it already owns, but the
    // registration action must not import or use it any more.
    assert.equal(MOBILE_STAFF_CODE, "WH");
    assert.equal(
      action.includes("staffCode: MOBILE_STAFF_CODE"),
      false,
      "the generic WH raiser must not be used for new Issues"
    );
    assert.equal(
      action.includes("MOBILE_STAFF_CODE"),
      false,
      "the action must not even import the WH constant"
    );
  });

  it("the registration action hardcodes no raiser at all", () => {
    const action = source("app/mobile/register-actions.ts");
    for (const code of ['"ND"', '"SA"', '"ST"', '"NV"', '"AT"', '"WH"', '"TU"']) {
      assert.equal(action.includes(code), false, `must not hardcode staff code ${code}`);
    }
    assert.equal(action.includes("input.staffCode"), false, "the client must not choose the raiser");
  });
});

// ---------------------------------------------------------------------------
// Impersonation: what the browser may and may not decide
// ---------------------------------------------------------------------------

describe("the browser cannot choose who raised an Issue, for a raised_by user", () => {
  it("Mobile Lite reads NO raiser from the request — it resolves one", () => {
    const action = source("app/mobile/register-actions.ts");
    assert.equal(action.includes("input.staffCode"), false);
    // The lookup key is the SESSION's user id, not anything in the payload.
    assert.ok(action.includes("findRaiserForUser(user.userId)"));
    assert.ok(action.includes("staffCode: raiser.staffCode"));
  });

  it("the desktop form accepts a raiser ONLY on the on-behalf branch", () => {
    // A Super Admin files an Issue ON BEHALF OF a raiser, so they pick one.
    // Raised-by-Staff now also creates from the web — and for them the form key
    // is never read; the raiser comes from their linked issue_staff row.
    const action = source("app/dashboard/issues/new/actions.ts");
    assert.ok(action.includes('readText(formData, "staffCode")'));
    assert.ok(action.includes('hasPermission(user, "issue:create")'));
    assert.ok(action.includes("const selfRaiser = isIssuesOnlyRole(user.role)"));
    assert.ok(action.includes("staffCode = raiser.staffCode"));
  });

  it("raised_by creates only as itself, on both channels", () => {
    assert.equal(roleHasPermission("raised_by", "issue:create"), true);
    assert.equal(roleHasPermission("raised_by", "user:manage"), false);
    assert.deepEqual([...permissionsForRole("raised_by")].sort(), [
      "issue:create",
      "issue:view_all",
      "mobile:submit",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Other roles are not part of this change
// ---------------------------------------------------------------------------

describe("Super Admin, Assignee and the assignee link are untouched", () => {
  it("Super Admin keeps its full set", () => {
    const admin = permissionsForRole("admin");
    for (const permission of ["issue:create", "issue:delete", "user:manage", "tracker:view"] as const) {
      assert.equal(admin.has(permission), true);
    }
  });

  it("Assignee keeps exactly its three scoped permissions", () => {
    assert.deepEqual([...permissionsForRole("staff")].sort(), [
      "issue:analyse_own_assigned",
      "issue:change_status_own_assigned",
      "issue:view_own_assigned",
    ]);
  });

  it("assignee ownership is never derived from the raiser", () => {
    const permissions = source("lib/access/permissions.ts");
    assert.ok(permissions.includes("Ownership is NEVER derived from issue_staff"));
    const link = source("lib/queries/assigneeLink.ts");
    assert.ok(link.includes("issue_staff"));
  });
});

// ---------------------------------------------------------------------------
// The prepared migration — safety properties
// ---------------------------------------------------------------------------

describe("migration 014 is prepared and links nobody", () => {
  const forward = migration("014_raised_by_staff_link.sql");
  const rollback = migration("014_raised_by_staff_link_rollback.sql");
  const verify = migration("014_raised_by_staff_link_verify.sql");
  const forwardSql = sqlOnly(forward);
  const rollbackSql = sqlOnly(rollback);
  const verifySql = sqlOnly(verify);

  it("gates on BOTH database and user before any write", () => {
    for (const [name, sql] of [["forward", forwardSql], ["rollback", rollbackSql]] as const) {
      assert.ok(
        sql.includes("current_database() <> 'varmen_db' OR current_user <> 'varmen_user'"),
        `${name} must gate on both identity values`
      );
      assert.ok(
        sql.indexOf("current_user <> 'varmen_user'") < sql.indexOf("ALTER TABLE"),
        `${name} must gate before the first ALTER`
      );
    }
  });

  it("adds one nullable column plus an FK and a UNIQUE, and nothing else", () => {
    assert.ok(forwardSql.includes("ADD COLUMN staff_code VARCHAR(20)"));
    assert.ok(forwardSql.includes("REFERENCES issue_tracking.issue_staff(staff_code)"));
    assert.ok(forwardSql.includes("ADD CONSTRAINT management_users_staff_code_key UNIQUE (staff_code)"));
    assert.equal(forwardSql.includes("NOT NULL"), false, "the column must be nullable");
  });

  it("links NOBODY — no UPDATE, no INSERT, no backfill", () => {
    // Matched at the START of a statement, so the FK's `ON UPDATE CASCADE`
    // referential action is not mistaken for a DML statement.
    for (const keyword of ["UPDATE", "INSERT", "DELETE", "TRUNCATE"]) {
      const statement = new RegExp(`(^|;)\\s*${keyword}\\b`, "im");
      assert.equal(
        statement.test(forwardSql),
        false,
        `migration 014 must contain no ${keyword} statement`
      );
    }
    // And the only referential UPDATE present is the FK action.
    assert.ok(forwardSql.includes("ON UPDATE CASCADE"));
  });

  it("invents no staff_code for anyone", () => {
    // The owner chooses it. Nothing that looks like a code may be assigned.
    assert.equal(/staff_code\s*=\s*'[A-Z0-9]+'/.test(forwardSql), false);
    for (const guess of ["'TU'", "'TS'", "'TEST'", "'RB'", "'RBS'"]) {
      assert.equal(forwardSql.includes(guess), false, `must not assign ${guess}`);
    }
  });

  it("does not add the raised_by-must-be-linked CHECK yet", () => {
    // It would abort: the existing raised_by account has no staff_code.
    assert.equal(
      forwardSql.includes("role <> 'raised_by' OR staff_code IS NOT NULL"),
      false,
      "that CHECK belongs in a later migration, after linkage"
    );
  });

  it("touches only issue_tracking.management_users", () => {
    const altered = [...forwardSql.matchAll(/ALTER TABLE\s+(\S+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(altered)], ["issue_tracking.management_users"]);
  });

  it("refuses to run twice and requires migration 013 first", () => {
    assert.ok(forward.includes("migration 014 appears to be applied already"));
    assert.ok(forward.includes("migration 013 is not applied"));
  });

  it("the rollback refuses while any account is linked", () => {
    assert.ok(rollback.includes("Refusing to roll back:"));
    assert.ok(rollbackSql.includes("WHERE staff_code IS NOT NULL"));
    // It must never resolve the problem by editing an account.
    assert.equal(rollbackSql.includes("UPDATE issue_tracking.management_users"), false);
    assert.equal(rollbackSql.includes("DELETE FROM issue_tracking"), false);
  });

  it("the verification file is read-only", () => {
    for (const forbidden of ["INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "CREATE", "BEGIN;", "COMMIT;"]) {
      assert.equal(
        verifySql.includes(forbidden),
        false,
        `the verify file must contain no ${forbidden}`
      );
    }
    assert.ok(verifySql.includes("SELECT"));
    assert.ok(verify.includes("current_database"));
    assert.ok(verify.includes("current_user"));
  });

  it("the verification proves the historical WH Issues are still raised by WH", () => {
    assert.ok(verify.includes("must remain raised by WH"));
    assert.ok(verifySql.includes("WHERE staff_code = 'WH'"));
    assert.ok(verifySql.includes("extra_data->>'mobileSource'"));
  });
});

describe("migration 015 links exactly one person, in one transaction", () => {
  const forward = migration("015_link_testuser_raiser.sql");
  const rollback = migration("015_link_testuser_raiser_rollback.sql");
  const verify = migration("015_link_testuser_raiser_verify.sql");
  const forwardSql = sqlOnly(forward);
  const rollbackSql = sqlOnly(rollback);
  const verifySql = sqlOnly(verify);

  it("gates on BOTH database and user before any write", () => {
    for (const [name, sql] of [["forward", forwardSql], ["rollback", rollbackSql]] as const) {
      assert.ok(sql.includes("current_database() <> 'varmen_db' OR current_user <> 'varmen_user'"));
      assert.ok(
        sql.indexOf("current_user <> 'varmen_user'") < sql.search(/(INSERT|UPDATE|DELETE)\s/),
        `${name} must gate before its first write`
      );
    }
  });

  it("is a single transaction — no partial state is possible", () => {
    assert.equal((forwardSql.match(/^BEGIN;/gm) ?? []).length, 1);
    assert.equal((forwardSql.match(/^COMMIT;/gm) ?? []).length, 1);
    // Both halves are inside it: the raiser INSERT and the account UPDATE.
    const begin = forwardSql.indexOf("BEGIN;");
    const commit = forwardSql.indexOf("COMMIT;");
    assert.ok(forwardSql.indexOf("INSERT INTO issue_tracking.issue_staff") > begin);
    assert.ok(forwardSql.indexOf("UPDATE issue_tracking.management_users") < commit);
  });

  it("creates TU / TestUser, active", () => {
    assert.ok(forwardSql.includes("INSERT INTO issue_tracking.issue_staff (staff_code, staff_name, active)"));
    assert.ok(forwardSql.includes("VALUES ('TU', 'TestUser', TRUE)"));
  });

  it("writes ONLY staff_code on the account — no credential, role or active change", () => {
    assert.ok(forwardSql.includes("SET staff_code = 'TU'"));
    // Only assignments matter: `WHERE role = 'raised_by'` is a lookup, not a
    // write, so the check looks at what follows SET.
    // [\s\S] rather than the `s` flag, which the test tsconfig target rejects.
    const assignments = [...forwardSql.matchAll(/SET[\s\S]+?WHERE/g)].map((m) => m[0]);
    assert.ok(assignments.length > 0, "the migration must contain a SET clause");
    for (const clause of assignments) {
      for (const forbidden of ["password_hash", "username", "email", "role", "active"]) {
        assert.equal(
          new RegExp(`\\b${forbidden}\\s*=`).test(clause),
          false,
          `migration 015 must not assign ${forbidden}`
        );
      }
    }
    assert.equal(forwardSql.includes("password_hash"), false, "it must not read a hash either");
  });

  it("refuses rather than guessing which account to link", () => {
    assert.ok(forward.includes("expected exactly 1 raised_by account"));
    assert.ok(forward.includes("already linked to staff_code"));
    assert.ok(forward.includes("staff_code TU already exists and belongs to"));
  });

  it("creates no Issue and consumes no Issue number", () => {
    assert.equal(forwardSql.includes("INSERT INTO issue_tracking.issues"), false);
    // It may NAME the generator in a message; it must never CALL it.
    assert.equal(forwardSql.includes("SELECT issue_tracking.next_issue_id"), false);
    assert.equal(forwardSql.includes("next_issue_id("), false);
    // And it asserts, before COMMIT, that TU owns neither.
    assert.ok(forward.includes("this migration must create none"));
    assert.ok(forward.includes("so the first Issue is TU-001"));
  });

  it("touches no Issue and no other raiser", () => {
    for (const forbidden of [
      "UPDATE issue_tracking.issues",
      "DELETE FROM issue_tracking.issues",
      "UPDATE issue_tracking.issue_staff",
      "DELETE FROM issue_tracking.issue_staff",
    ]) {
      assert.equal(forwardSql.includes(forbidden), false, `must not contain ${forbidden}`);
    }
    // It asserts the pre-existing raisers, WH included, survived untouched.
    assert.ok(forwardSql.includes("ARRAY['AT', 'ND', 'NV', 'SA', 'ST', 'WH']"));
    assert.ok(forward.includes("WH / Warehouse Mobile was altered"));
  });

  it("the rollback refuses once TU has raised anything", () => {
    assert.ok(rollback.includes("Refusing to roll back: TU has raised"));
    assert.ok(rollbackSql.includes("FROM issue_tracking.issues"));
    assert.ok(rollbackSql.includes("WHERE staff_code = 'TU'"));
    // It must never delete an Issue to make itself possible.
    assert.equal(rollbackSql.includes("DELETE FROM issue_tracking.issues"), false);
    assert.ok(rollback.includes("never delete an Issue"));
  });

  it("the rollback refuses if Issue IDs were already allocated", () => {
    assert.ok(rollbackSql.includes("FROM issue_tracking.issue_number_counters"));
    assert.ok(rollback.includes("could let the same ID be issued again later"));
  });

  it("the rollback leaves the login intact", () => {
    assert.ok(rollbackSql.includes("SET staff_code = NULL"));
    for (const forbidden of ["password_hash", "DELETE FROM issue_tracking.management_users"]) {
      assert.equal(rollbackSql.includes(forbidden), false, `rollback must not touch ${forbidden}`);
    }
    assert.ok(rollback.includes("a rollback must not touch the account"));
  });

  it("the verification file is read-only and proves the end state", () => {
    for (const forbidden of ["INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "CREATE", "BEGIN;", "COMMIT;"]) {
      assert.equal(verifySql.includes(forbidden), false, `verify must contain no ${forbidden}`);
    }
    assert.ok(verify.includes("current_database"));
    assert.ok(verify.includes("current_user"));
    assert.ok(verifySql.includes("'TU-001'"));
    assert.ok(verify.includes("No orphan relationships"));
  });
});

describe("the raiser is resolved server-side, and fails closed", () => {
  const link = source("lib/queries/raiserLink.ts");
  const linkCode = codeOnly(link);
  const action = source("app/mobile/register-actions.ts");
  const actionCode = codeOnly(action);

  it("resolves through the session user id only", () => {
    assert.ok(link.includes("export async function findRaiserForUser(userId: number)"));
    assert.ok(actionCode.includes("const user = await getCurrentUser()"));
    assert.ok(actionCode.includes("findRaiserForUser(user.userId)"));
    // Ordering compared against CODE, not the header prose — and against CALL
    // SITES, not the import list, which necessarily comes first in the file.
    const gate = actionCode.indexOf('hasPermission(user, "mobile:submit")');
    const resolve = actionCode.indexOf("findRaiserForUser(user.userId)");
    const create = actionCode.indexOf("createMobileIssue({");
    assert.ok(gate > 0 && resolve > 0 && create > 0, "all three call sites must exist");
    assert.ok(gate < resolve, "the permission gate must run before the raiser is resolved");
    assert.ok(resolve < create, "the raiser must be resolved before the Issue is created");
  });

  it("requires the account AND the raiser to be active, in one query", () => {
    assert.ok(link.includes("JOIN issue_tracking.issue_staff s ON s.staff_code = mu.staff_code"));
    assert.ok(link.includes("mu.active = true"));
    assert.ok(link.includes("s.active = true"));
    assert.ok(link.includes("WHERE mu.user_id = $1"));
  });

  it("is read-only — the link is written by migration, never by a request", () => {
    for (const forbidden of ["INSERT", "UPDATE", "DELETE"]) {
      assert.equal(linkCode.includes(forbidden), false, `raiserLink must contain no ${forbidden}`);
    }
  });

  it("refuses an unlinked account instead of falling back to WH", () => {
    assert.ok(actionCode.includes("if (!raiser)"));
    assert.ok(actionCode.includes("return { error: NOT_SET_UP }"));
    assert.equal(actionCode.includes("MOBILE_STAFF_CODE"), false);
    assert.ok(actionCode.includes("has no active linked raiser"));
  });

  it("still refuses an unauthenticated or non-mobile caller first", () => {
    assert.ok(actionCode.includes("if (!user || !(await hasPermission(user, \"mobile:submit\"))"));
    assert.ok(actionCode.includes("return { error: SESSION_EXPIRED }"));
    // Only raised_by and admin hold it; the Assignee does not.
    assert.equal(roleHasPermission("staff", "mobile:submit"), false);
    assert.equal(roleHasPermission("management", "mobile:submit"), false);
    assert.equal(roleHasPermission(null, "mobile:submit"), false);
    assert.equal(roleHasPermission("raised_by", "mobile:submit"), true);
  });

  it("the error message names no table, column or staff code", () => {
    const message = action.slice(action.indexOf("const NOT_SET_UP"), action.indexOf("export async function"));
    for (const leak of ["issue_staff", "management_users", "staff_code", "TU", "WH"]) {
      assert.equal(message.includes(leak), false, `the message must not mention ${leak}`);
    }
  });
});
