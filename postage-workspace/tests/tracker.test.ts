// Super Admin Tracker — access, sort whitelist, and summary maths.
//
// Runs on Node's built-in test runner via tsx (`npm test`). No database: the
// rules live in lib/access/tracker.ts and lib/access/permissions.ts, both pure
// modules with no `server-only` import, which is exactly what the page and the
// query layer delegate to.
//
// What this file proves and what it does not:
//  - PROVES the access decision (who may reach the Tracker and who sees the
//    sidebar link), the sort whitelist (including that a hostile ?sort= can
//    never produce SQL), and the completion/divide-by-zero maths.
//  - Does NOT execute the SQL. lib/queries/tracker.ts imports `server-only`
//    and cannot be loaded by plain tsx. Its correctness against the real
//    schema — the summary counts, the current-assignment rule, the joins —
//    is checked by npm run verify:scope and by the live page.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completionPercent,
  LAST_ACTIVITY_FALLBACK,
  normalizeTrackingState,
  resolveTrackerOrderBy,
  TRACKER_DEFAULT_ORDER_BY,
  TRACKER_SORT_COLUMNS,
  TRACKING_STATE_STALE_DAYS,
  TRACKING_STATES,
  type TrackerSortKey,
} from "../lib/access/tracker";
import { permissionsForRole, roleHasPermission } from "../lib/access/permissions";

const ADMIN = "admin" as const;
const ASSIGNEE = "staff" as const;
const MANAGEMENT = "management" as const;

describe("access — Tracker is Super Admin only", () => {
  it("the Super Admin holds tracker:view", () => {
    assert.equal(roleHasPermission(ADMIN, "tracker:view"), true);
  });

  it("the Assignee does NOT hold tracker:view", () => {
    assert.equal(roleHasPermission(ASSIGNEE, "tracker:view"), false);
  });

  it("'management' does NOT hold tracker:view either", () => {
    // Deliberate: management holds issue:view_all and discussion:view, so a
    // sidebar flag derived from either of those would have leaked Tracker to
    // them. It is derived from tracker:view alone.
    assert.equal(roleHasPermission(MANAGEMENT, "tracker:view"), false);
  });

  it("an unauthenticated request holds nothing", () => {
    assert.equal(roleHasPermission(null, "tracker:view"), false);
  });

  it("tracker:view is admin-exclusive across the whole matrix", () => {
    const holders = ([ADMIN, MANAGEMENT, ASSIGNEE] as const).filter((role) =>
      permissionsForRole(role).has("tracker:view")
    );
    assert.deepEqual(holders, [ADMIN]);
  });

  it("the Assignee's sidebar cannot contain Tracker", () => {
    // The sidebar renders the link only when showTracker is true, and
    // DashboardLayout sets that from exactly this check.
    assert.equal(roleHasPermission(ASSIGNEE, "tracker:view"), false);
  });

  it("granting the Assignee Tracker would require an explicit matrix edit", () => {
    // Guards against a future "staff inherits from admin" refactor: the sets
    // are independent literals, so staff's set must stay tiny.
    const staffPermissions = [...permissionsForRole(ASSIGNEE)];
    assert.deepEqual(staffPermissions.sort(), [
      // Assignee-only AI assistance, added deliberately. The point of this
      // assertion is that the set stays SMALL and explicit — every addition
      // has to be made here as well as in the matrix.
      "issue:analyse_own_assigned",
      "issue:change_status_own_assigned",
      "issue:view_own_assigned",
    ]);
    // Still no Tracker, and still no desktop creation. Warehouse Mobile Lite
    // adds nothing here: it requires no Issue Tracker account at all.
    assert.equal(staffPermissions.includes("tracker:view"), false);
    assert.equal(staffPermissions.includes("issue:create"), false);
  });
});

describe("sort whitelist — the approved sortable columns", () => {
  const EXPECTED: TrackerSortKey[] = [
    "issueId",
    "title",
    "assignee",
    "status",
    "priority",
    "domain",
    "created",
    "assigned",
    "daysOpen",
    "lastActivity",
  ];

  it("contains exactly the approved keys", () => {
    assert.deepEqual(Object.keys(TRACKER_SORT_COLUMNS).sort(), [...EXPECTED].sort());
  });

  for (const key of EXPECTED) {
    it(`resolves "${key}" ascending and descending`, () => {
      const asc = resolveTrackerOrderBy(key, "asc");
      const desc = resolveTrackerOrderBy(key, "desc");
      assert.ok(asc.includes(TRACKER_SORT_COLUMNS[key]));
      assert.ok(asc.includes("ASC"));
      assert.ok(desc.includes("DESC"));
      // Stable paging: every ordering ends with the issue_id tiebreaker.
      assert.ok(asc.endsWith("issue_id ASC"));
      assert.ok(desc.endsWith("issue_id ASC"));
    });
  }

  it("Raised By is deliberately not sortable", () => {
    assert.equal(Object.prototype.hasOwnProperty.call(TRACKER_SORT_COLUMNS, "staff"), false);
    assert.equal(resolveTrackerOrderBy("staff", "asc"), TRACKER_DEFAULT_ORDER_BY);
  });
});

describe("sort whitelist — hostile input never reaches SQL", () => {
  const HOSTILE = [
    "i.issue_id; DROP TABLE issue_tracking.issues --",
    "1; DELETE FROM issue_tracking.issue_assignments",
    "issue_id) UNION SELECT password_hash FROM issue_tracking.management_users --",
    "__proto__",
    "constructor",
    "toString",
    "",
    "   ",
  ];

  for (const value of HOSTILE) {
    it(`falls back to the default order for ${JSON.stringify(value)}`, () => {
      assert.equal(resolveTrackerOrderBy(value, "asc"), TRACKER_DEFAULT_ORDER_BY);
    });
  }

  it("undefined sort falls back to the default order", () => {
    assert.equal(resolveTrackerOrderBy(undefined, undefined), TRACKER_DEFAULT_ORDER_BY);
  });

  it("a hostile ORDER direction can only ever become ASC or DESC", () => {
    const injected = resolveTrackerOrderBy("title", "asc; DROP TABLE issue_tracking.issues");
    assert.ok(injected.endsWith("issue_id ASC"));
    assert.equal(injected.includes("DROP"), false);
    // Anything that is not exactly "desc" is treated as ascending.
    assert.ok(injected.includes("ASC"));
  });

  it("prototype keys cannot smuggle a value through the lookup", () => {
    // hasOwnProperty (not `in`) is what stops "toString" resolving to
    // Object.prototype.toString and being interpolated.
    assert.equal(resolveTrackerOrderBy("toString", "asc"), TRACKER_DEFAULT_ORDER_BY);
    assert.equal(resolveTrackerOrderBy("valueOf", "desc"), TRACKER_DEFAULT_ORDER_BY);
  });

  it("every whitelist value is a hand-written literal, not built from input", () => {
    for (const expression of Object.values(TRACKER_SORT_COLUMNS)) {
      assert.equal(typeof expression, "string");
      assert.ok(expression.length > 0);
      assert.equal(expression.includes(";"), false, `"${expression}" contains a statement separator`);
      assert.equal(expression.includes("--"), false, `"${expression}" contains a comment marker`);
    }
  });
});

describe("completion percentage", () => {
  it("0 of 0 is 0% — divide-by-zero handled", () => {
    assert.equal(completionPercent(0, 0), 0);
  });

  it("0 of 5 is 0%", () => {
    assert.equal(completionPercent(5, 0), 0);
  });

  it("5 of 5 is 100%", () => {
    assert.equal(completionPercent(5, 5), 100);
  });

  it("1 of 2 is 50%", () => {
    assert.equal(completionPercent(2, 1), 50);
  });

  it("2 of 3 rounds to 67%", () => {
    assert.equal(completionPercent(3, 2), 67);
  });

  it("1 of 3 rounds to 33%", () => {
    assert.equal(completionPercent(3, 1), 33);
  });

  it("never exceeds 100% even if the counts disagree", () => {
    assert.equal(completionPercent(2, 5), 100);
  });

  it("never goes negative", () => {
    assert.equal(completionPercent(5, -1), 0);
    assert.equal(completionPercent(-5, 2), 0);
  });

  it("survives NaN from a bad numeric cast", () => {
    assert.equal(completionPercent(Number.NaN, 2), 0);
    assert.equal(completionPercent(5, Number.NaN), 0);
  });

  it("is always a whole number between 0 and 100", () => {
    for (let total = 0; total <= 12; total++) {
      for (let green = 0; green <= total; green++) {
        const percent = completionPercent(total, green);
        assert.ok(Number.isInteger(percent), `${green}/${total} -> ${percent}`);
        assert.ok(percent >= 0 && percent <= 100, `${green}/${total} -> ${percent}`);
      }
    }
  });
});

describe("Tracking State — vocabulary and filter validation", () => {
  it("has exactly the five approved states", () => {
    assert.deepEqual(
      [...TRACKING_STATES],
      ["Not Started", "In Progress", "Completed", "Returned to Not Solved", "No Recent Update"]
    );
  });

  it("is a management signal, not a copy of the Issue status", () => {
    // None of the state names is a status name — the two columns are shown
    // side by side and must not read as duplicates of each other.
    for (const state of TRACKING_STATES) {
      assert.equal(["RED", "AMBER", "GREEN"].includes(state), false);
    }
  });

  it("accepts each valid state as a filter", () => {
    for (const state of TRACKING_STATES) {
      assert.equal(normalizeTrackingState(state), state);
    }
  });

  it("treats an empty or missing value as 'no filter'", () => {
    assert.equal(normalizeTrackingState(undefined), null);
    assert.equal(normalizeTrackingState(""), null);
    assert.equal(normalizeTrackingState("   "), null);
  });

  it("rejects anything not in the list rather than passing it to SQL", () => {
    const HOSTILE = [
      "Completed'; DROP TABLE issue_tracking.issues --",
      "' OR 1=1 --",
      "completed",
      "In progress",
      "__proto__",
      "toString",
      "RED",
    ];
    for (const value of HOSTILE) {
      assert.equal(normalizeTrackingState(value), null, `${value} was not rejected`);
    }
  });

  it("the stale threshold is a single named, visible constant", () => {
    assert.equal(typeof TRACKING_STATE_STALE_DAYS, "number");
    assert.ok(TRACKING_STATE_STALE_DAYS > 0);
    assert.ok(Number.isInteger(TRACKING_STATE_STALE_DAYS));
  });
});

describe("Last Activity fallback is documented, in order", () => {
  it("lists four real sources", () => {
    assert.equal(LAST_ACTIVITY_FALLBACK.length, 4);
  });

  it("prefers status history, then investigation notes, then assignment, then updated_at", () => {
    assert.match(LAST_ACTIVITY_FALLBACK[0], /issue_status_history\.changed_at/);
    assert.match(LAST_ACTIVITY_FALLBACK[1], /issue_comments\.created_at/);
    assert.match(LAST_ACTIVITY_FALLBACK[2], /issue_assignments\.assigned_at/);
    assert.match(LAST_ACTIVITY_FALLBACK[3], /issues\.updated_at/);
  });

  it("every source is a stored column — nothing is invented", () => {
    for (const source of LAST_ACTIVITY_FALLBACK) {
      assert.match(source, /^issue(s|_[a-z_]+)\./);
    }
  });
});
