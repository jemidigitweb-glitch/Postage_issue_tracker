// migrate-issues.js — one-time migration of postage-daily-issues.html's
// hardcoded ISSUES array into issue_tracking.issue_staff / issue_tracking.issues.
//
// Usage:
//   node migrate-issues.js                (default — dry run, no DB connection, no writes)
//   node migrate-issues.js --execute       (connects and runs the real migration)
//
// Requires env var MIGRATION_DB_URL when --execute is used (a Postgres connection string).
// Optional env var PGSSL=require if the connection needs SSL.
// MIGRATION_DB_URL is never logged, printed, or included in any error message below.
//
// Safety model:
//  - Defaults to dry-run. --execute is required to touch the database at all.
//  - STRICT DATA-ONLY: this script never issues CREATE SCHEMA, CREATE TABLE,
//    CREATE INDEX, ALTER, DROP, or TRUNCATE — it does not read or execute
//    001_create_tables.sql. It assumes issue_tracking.issue_staff and
//    issue_tracking.issues already exist and aborts (read-only, zero writes)
//    if either table is missing. 001_create_tables.sql is kept in this
//    directory only as a reference for what schema is expected — it is not
//    executed by this script.
//  - HARD TARGET-DATABASE CHECK: immediately after connecting, and before
//    BEGIN or any INSERT/UPDATE/DELETE, the script runs
//    `SELECT current_database()`. If the result is not exactly "varmen_db",
//    it stops immediately with zero writes performed. This check is
//    mandatory and cannot be skipped. The connected user (expected
//    "varmen_user") is also checked, but only reported — it does not block
//    execution the way the database check does.
//  - Every SQL statement in this file is fully schema-qualified
//    (issue_tracking.issue_staff / issue_tracking.issues) — nothing relies
//    on search_path for safety.
//  - Everything --execute does — the table-existence precondition, conflict
//    checks, inserts, and verification — happens inside ONE transaction
//    (aside from the pre-BEGIN identity/existence checks, which are
//    read-only), so a failure at any point cannot leave partially-inserted
//    data.
//  - Conflict handling is NOT "ON CONFLICT DO NOTHING". Every staff_code / issue_id is
//    checked against any existing row first:
//      * no existing row       -> queued for INSERT
//      * existing row identical -> already migrated, skipped (not an error, not re-inserted)
//      * existing row differs  -> CONFLICT — nothing is inserted or overwritten, and the
//                                  whole transaction is rolled back
//  - A single conflict, a verification failure, or a row-count mismatch rolls back
//    everything — partial writes are not possible.
//  - Never renumbers or regenerates issue_id — the source ticketId is used verbatim.
//  - This script never touches any database other than the one MIGRATION_DB_URL
//    points to, and never touches any schema/table other than issue_tracking.* —
//    it has no code path that references ledsone, ph_dashboard, postgres,
//    staff.users, employee_management.staff, or any other existing table.

const fs = require('fs');
const path = require('path');
// 'pg' is only required when actually writing to the database — dry-run mode
// (the default) has zero external dependencies beyond Node's own fs/path.

const SOURCE_FILE = path.join(__dirname, '..', 'postage-daily-issues.html');
const EXECUTE = process.argv.includes('--execute');

// ── Extraction ──────────────────────────────────────────────────────────────

function extractIssues(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const start = html.indexOf('const ISSUES = [');
  if (start === -1) throw new Error('const ISSUES = [ ... ] not found in ' + filePath);
  const end = html.indexOf('const PENDING_REVIEW_COUNT');
  if (end === -1) throw new Error('End marker (const PENDING_REVIEW_COUNT) not found');
  let arrText = html.slice(start + 'const ISSUES = '.length, end).trim();
  if (arrText.endsWith(';')) arrText = arrText.slice(0, -1);
  return JSON.parse(arrText);
}

// ── Transformation — every normalization records its own "original" value ──
// only when the normalized value actually differs from the source, so
// extra_data stays lean but nothing is silently corrected without a trace.

function normalizePriority(raw) {
  const original = raw == null ? '' : String(raw);
  const normalized = original.trim().toLowerCase();
  return {
    value: normalized === '' ? null : normalized,
    original: normalized !== original ? original : null,
  };
}

function normalizeStatus(raw) {
  const original = raw == null ? '' : String(raw);
  const normalized = original.trim().toUpperCase();
  return {
    value: normalized === '' ? null : normalized,
    original: normalized !== original ? original : null,
  };
}

function normalizeStaffName(raw) {
  const original = raw == null ? '' : String(raw);
  const normalized = original.trim();
  return {
    value: normalized,
    original: normalized !== original ? original : null,
  };
}

function normalizeDate(raw) {
  const original = raw == null ? '' : String(raw);
  const canonical = /^\d{4}-\d{2}-\d{2}$/.test(original.trim());
  return {
    value: canonical ? original.trim() : null,
    original: canonical ? null : original, // only kept if it did NOT already match YYYY-MM-DD
  };
}

function deriveStaffCode(ticketId) {
  const code = (ticketId || '').split('-')[0];
  if (!code) throw new Error(`Cannot derive staff_code from ticketId "${ticketId}"`);
  return code;
}

function buildExtraData(issue, preserved) {
  const extra = {};
  if (issue.member) extra.member = issue.member;
  if (issue.rootCause) extra.rootCause = issue.rootCause;
  if (issue.whatIsHappening) extra.whatIsHappening = issue.whatIsHappening;
  if (issue.documentGap) extra.documentGap = issue.documentGap;
  if (issue.dataLink) extra.dataLink = issue.dataLink;
  // Original pre-normalization values — only present when normalization
  // actually changed something for this record (see normalize* functions above).
  if (preserved.priority) extra.originalPriority = preserved.priority;
  if (preserved.status) extra.originalStatus = preserved.status;
  if (preserved.staffName) extra.originalStaffName = preserved.staffName;
  if (preserved.date) extra.originalDateRaised = preserved.date;
  return extra;
}

function transform(issues) {
  const staffMap = new Map(); // staff_code -> { staff_name, original_staff_name }
  const invalidRecords = [];
  const prefixMismatches = [];

  issues.forEach((issue) => {
    if (!/^[A-Z]{2,3}-\d{3}$/.test(issue.ticketId || '')) {
      invalidRecords.push({ ticketId: issue.ticketId, reason: 'ticketId does not match PREFIX-NNN format' });
    }
    const required = ['ticketId', 'raisedBy', 'dateRaised', 'domain', 'status', 'title', 'description'];
    const missing = required.filter((f) => !issue[f]);
    if (missing.length) invalidRecords.push({ ticketId: issue.ticketId, reason: `missing fields: ${missing.join(', ')}` });
  });

  issues.forEach((issue) => {
    const code = deriveStaffCode(issue.ticketId);
    const nameNorm = normalizeStaffName(issue.raisedBy);
    if (staffMap.has(code) && staffMap.get(code).staff_name !== nameNorm.value) {
      prefixMismatches.push({
        ticketId: issue.ticketId, staff_code: code,
        existingName: staffMap.get(code).staff_name, thisRecordName: nameNorm.value,
      });
    } else {
      staffMap.set(code, { staff_name: nameNorm.value });
    }
  });

  const staffRows = [...staffMap.entries()].map(([staff_code, v]) => ({ staff_code, staff_name: v.staff_name }));

  const issueRows = issues.map((issue) => {
    const priorityNorm = normalizePriority(issue.priority);
    const statusNorm = normalizeStatus(issue.status);
    const nameNorm = normalizeStaffName(issue.raisedBy);
    const dateNorm = normalizeDate(issue.dateRaised);
    return {
      issue_id: issue.ticketId, // preserved verbatim — never renumbered
      staff_code: deriveStaffCode(issue.ticketId),
      issue_title: issue.title,
      issue_description: issue.description || null,
      category: issue.domain || null,
      status: statusNorm.value,
      priority: priorityNorm.value,
      resolution: issue.fix || null,
      created_date: dateNorm.value,
      completed_date: null,
      extra_data: buildExtraData(issue, {
        priority: priorityNorm.original,
        status: statusNorm.original,
        staffName: nameNorm.original,
        date: dateNorm.original,
      }),
    };
  });

  // Duplicate issue_id check (informational — the source currently has none,
  // but this must be checked every run since it drives conflict detection).
  const idCounts = {};
  issueRows.forEach((r) => { idCounts[r.issue_id] = (idCounts[r.issue_id] || 0) + 1; });
  const duplicateIds = Object.entries(idCounts).filter(([, c]) => c > 1).map(([id]) => id);

  return { staffRows, issueRows, invalidRecords, prefixMismatches, duplicateIds };
}

// ── Comparison helpers ──────────────────────────────────────────────────────
// DATE columns must never be compared via a JS Date object: node-postgres's
// default type parser builds that Date using this process's local timezone,
// and .toISOString() then reads back the UTC calendar day — which silently
// shifts by one day whenever the local timezone is ahead of UTC (verified:
// this ran a day early on this machine, TZ offset -330 = UTC+5:30). Every
// query below that reads created_date now casts it to `::text` in SQL, so it
// arrives as an already-exact 'YYYY-MM-DD' string — no JS Date involved.
//
// extra_data (JSONB) must never be compared via JSON.stringify(): key order
// in the stored object is not guaranteed to match insertion order, and
// JSON.stringify is order-sensitive, producing false "conflict"/"mismatch"
// results for objects that are semantically identical. jsonEquivalent()
// below compares by value, recursively, ignoring object key order (array
// element order still matters, per JSON/JS semantics).

function jsonEquivalent(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => jsonEquivalent(v, b[i]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEquivalent(a[k], b[k]));
}

// ── Conflict classification against existing DB rows ───────────────────────
// Every staff_code / issue_id is checked individually. Three outcomes only:
// 'insert' (no existing row), 'match' (existing row identical), 'conflict'
// (existing row differs — never overwritten, always aborts the migration).

function classifyStaff(local, existingRow) {
  if (!existingRow) return { outcome: 'insert' };
  const same = existingRow.staff_name === local.staff_name;
  return same
    ? { outcome: 'match' }
    : { outcome: 'conflict', diff: { field: 'staff_name', existing: existingRow.staff_name, local: local.staff_name } };
}

function classifyIssue(local, existingRow) {
  if (!existingRow) return { outcome: 'insert' };
  // existingRow.created_date is expected to already be a 'YYYY-MM-DD' text
  // string here (caller must SELECT created_date::text) — never a JS Date.
  const fields = ['staff_code', 'issue_title', 'issue_description', 'category', 'status', 'priority', 'resolution', 'created_date'];
  const diffs = [];
  fields.forEach((f) => {
    if ((existingRow[f] ?? null) !== (local[f] ?? null)) diffs.push({ field: f, existing: existingRow[f], local: local[f] });
  });
  if (!jsonEquivalent(existingRow.extra_data || {}, local.extra_data || {})) {
    diffs.push({ field: 'extra_data', existing: existingRow.extra_data, local: local.extra_data });
  }
  return diffs.length === 0 ? { outcome: 'match' } : { outcome: 'conflict', diff: diffs };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const issues = extractIssues(SOURCE_FILE);
  const { staffRows, issueRows, invalidRecords, prefixMismatches, duplicateIds } = transform(issues);

  console.log(`Loaded ${issues.length} issues from ${SOURCE_FILE}`);
  console.log(`Derived ${staffRows.length} staff records: ${staffRows.map((s) => `${s.staff_code}=${s.staff_name}`).join(', ')}`);
  if (invalidRecords.length) console.log(`INVALID RECORDS: ${invalidRecords.length}`, invalidRecords);
  if (prefixMismatches.length) console.log(`PREFIX MISMATCHES: ${prefixMismatches.length}`, prefixMismatches);
  if (duplicateIds.length) console.log(`DUPLICATE issue_id: ${duplicateIds.length}`, duplicateIds);

  if (invalidRecords.length || prefixMismatches.length || duplicateIds.length) {
    console.error('\nRefusing to proceed — fix the above data issues before migrating (dry-run or execute).');
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log('\n=== DRY RUN — no database connection made, nothing written ===\n');
    console.log('issue_staff rows that would be evaluated for insert/match/conflict:');
    staffRows.forEach((r) => console.log('  ', JSON.stringify(r)));
    console.log(`\nissues rows that would be evaluated: ${issueRows.length} total. First 3 shown:`);
    issueRows.slice(0, 3).forEach((r) => console.log('  ', JSON.stringify(r)));
    console.log('\n(Insert vs. match vs. conflict can only be determined against the live database — run with --execute to see that classification. --execute still aborts on any conflict; it does not overwrite anything.)');
    return;
  }

  if (!process.env.MIGRATION_DB_URL) {
    console.error('Missing MIGRATION_DB_URL environment variable. Refusing to run --execute without it.');
    process.exit(1);
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.MIGRATION_DB_URL,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
  });
  // MIGRATION_DB_URL itself is never referenced again below except as the
  // connectionString value passed internally to `pg` — it is not logged,
  // and no error path below prints err.connectionString or similar.

  await client.connect();
  try {
    // ── Hard target-database safety check — runs BEFORE the transaction even
    // starts, and before any CREATE/INSERT/UPDATE/DELETE/ALTER/DROP. This is
    // mandatory and unconditional: if the connected database is not exactly
    // "varmen_db", the script stops immediately with zero writes performed.
    const dbCheck = await client.query('SELECT current_database() AS db, current_user AS usr;');
    const { db: connectedDb, usr: connectedUser } = dbCheck.rows[0];
    const REQUIRED_DB = 'varmen_db';
    const EXPECTED_USER = 'varmen_user';

    console.log(`Connected user: ${connectedUser} (expected: ${EXPECTED_USER}${connectedUser === EXPECTED_USER ? ', match' : ', MISMATCH — reported only, not blocking'})`);

    if (connectedDb !== REQUIRED_DB) {
      console.error(
        `SAFETY ABORT: connected database is not "${REQUIRED_DB}". Refusing to run any ` +
        `write operation. No schema, table, or data changes were made. ` +
        `(Connection string and password are never printed.)`
      );
      await client.end();
      process.exit(1);
    }
    console.log(`Target database confirmed: ${connectedDb} (matches required "${REQUIRED_DB}")`);

    // ── Data-only precondition — this script never issues CREATE SCHEMA,
    // CREATE TABLE, CREATE INDEX, ALTER, DROP, or TRUNCATE. It assumes
    // issue_tracking.issue_staff and issue_tracking.issues already exist and
    // aborts here (read-only so far, zero writes) if either is missing.
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'issue_tracking' AND table_name IN ('issue_staff', 'issues');`
    );
    const foundTables = tableCheck.rows.map((r) => r.table_name).sort();
    const REQUIRED_TABLES = ['issue_staff', 'issues'];
    const missingTables = REQUIRED_TABLES.filter((t) => !foundTables.includes(t));
    if (missingTables.length) {
      console.error(
        `SAFETY ABORT: required table(s) missing from schema issue_tracking: ${missingTables.join(', ')}. ` +
        `This script is data-only and will never CREATE SCHEMA, CREATE TABLE, or CREATE INDEX ` +
        `to fix that. No writes were made.`
      );
      await client.end();
      process.exit(1);
    }
    console.log(`Target tables confirmed present: ${foundTables.map((t) => `issue_tracking.${t}`).join(', ')}`);

    await client.query('BEGIN');

    // ── Pre-insert conflict checks — staff ──
    const staffPlan = [];
    for (const row of staffRows) {
      const res = await client.query(
        `SELECT staff_code, staff_name FROM issue_tracking.issue_staff WHERE staff_code = $1;`,
        [row.staff_code]
      );
      const classification = classifyStaff(row, res.rows[0] || null);
      staffPlan.push({ row, ...classification });
    }

    // ── Pre-insert conflict checks — issues ──
    const issuePlan = [];
    for (const row of issueRows) {
      const res = await client.query(
        `SELECT issue_id, staff_code, issue_title, issue_description, category, status,
                priority, resolution, created_date::text AS created_date, extra_data
         FROM issue_tracking.issues WHERE issue_id = $1;`,
        [row.issue_id]
      );
      const classification = classifyIssue(row, res.rows[0] || null);
      issuePlan.push({ row, ...classification });
    }

    const staffConflicts = staffPlan.filter((p) => p.outcome === 'conflict');
    const issueConflicts = issuePlan.filter((p) => p.outcome === 'conflict');

    if (staffConflicts.length || issueConflicts.length) {
      console.error(`CONFLICTS FOUND — ${staffConflicts.length} staff, ${issueConflicts.length} issues. Rolling back, nothing written.`);
      staffConflicts.forEach((c) => console.error('  staff conflict:', c.row.staff_code, c.diff));
      issueConflicts.forEach((c) => console.error('  issue conflict:', c.row.issue_id, JSON.stringify(c.diff)));
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const staffToInsert = staffPlan.filter((p) => p.outcome === 'insert');
    const issuesToInsert = issuePlan.filter((p) => p.outcome === 'insert');

    for (const { row } of staffToInsert) {
      await client.query(
        `INSERT INTO issue_tracking.issue_staff (staff_code, staff_name) VALUES ($1, $2);`,
        [row.staff_code, row.staff_name]
      );
    }
    for (const { row } of issuesToInsert) {
      await client.query(
        `INSERT INTO issue_tracking.issues
           (issue_id, staff_code, issue_title, issue_description, category, status,
            priority, resolution, created_date, completed_date, extra_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
        [
          row.issue_id, row.staff_code, row.issue_title, row.issue_description,
          row.category, row.status, row.priority, row.resolution,
          row.created_date, row.completed_date, JSON.stringify(row.extra_data),
        ]
      );
    }

    // ── In-transaction verification ──
    const countRes = await client.query(
      `SELECT (SELECT count(*) FROM issue_tracking.issue_staff)::int AS staff_count,
              (SELECT count(*) FROM issue_tracking.issues)::int AS issue_count;`
    );
    const { staff_count, issue_count } = countRes.rows[0];

    const perStaffRes = await client.query(
      `SELECT staff_code, count(*)::int AS cnt FROM issue_tracking.issues GROUP BY staff_code;`
    );
    const dbPerStaff = Object.fromEntries(perStaffRes.rows.map((r) => [r.staff_code, r.cnt]));
    // Expected per-staff counts are derived from the transformed source data
    // itself (not hardcoded) so this check stays correct if the source file
    // ever changes — today that evaluates to ND=45, SA=27, ST=6, NV=14.
    const expectedPerStaff = issueRows.reduce((acc, r) => {
      acc[r.staff_code] = (acc[r.staff_code] || 0) + 1;
      return acc;
    }, {});
    const perStaffMismatches = Object.keys(expectedPerStaff).filter(
      (code) => dbPerStaff[code] !== expectedPerStaff[code]
    );

    const orphanRes = await client.query(
      `SELECT i.issue_id FROM issue_tracking.issues i
       LEFT JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
       WHERE s.staff_code IS NULL;`
    );
    const dupeRes = await client.query(
      `SELECT issue_id FROM issue_tracking.issues GROUP BY issue_id HAVING count(*) > 1;`
    );
    const prefixMismatchRes = await client.query(
      `SELECT issue_id FROM issue_tracking.issues WHERE split_part(issue_id, '-', 1) <> staff_code;`
    );
    const missingFieldsRes = await client.query(
      `SELECT issue_id FROM issue_tracking.issues
       WHERE issue_title = '' OR issue_title IS NULL
          OR issue_description = '' OR issue_description IS NULL
          OR category = '' OR category IS NULL
          OR status = '' OR status IS NULL;`
    );

    // Sample-record spot check against the transformed source values.
    // ST-070 does not exist in the approved historical dataset. ST-006 is
    // used as the Sathis sample record. (Confirmed by direct scan of
    // postage-daily-issues.html: Sathis records run ST-001 through ST-006
    // only, 6 total — no ST-070 anywhere in the source.)
    const SAMPLE_IDS = ['SA-007', 'ND-001', 'ST-006', 'NV-001'];
    const sampleFailures = [];
    for (const id of SAMPLE_IDS) {
      const local = issueRows.find((r) => r.issue_id === id);
      if (!local) {
        sampleFailures.push({ issue_id: id, reason: 'not present in transformed source data — cannot verify' });
        continue;
      }
      const dbRes = await client.query(
        `SELECT issue_id, staff_code, issue_title, issue_description, category, status,
                priority, resolution, created_date::text AS created_date, extra_data
         FROM issue_tracking.issues WHERE issue_id = $1;`,
        [id]
      );
      if (!dbRes.rows[0]) {
        sampleFailures.push({ issue_id: id, reason: 'not found in database after insert' });
        continue;
      }
      const dbRow = dbRes.rows[0];
      const diffs = [
        ['staff_code', dbRow.staff_code, local.staff_code],
        ['issue_title', dbRow.issue_title, local.issue_title],
        ['issue_description', dbRow.issue_description, local.issue_description],
        ['category', dbRow.category, local.category],
        ['status', dbRow.status, local.status],
        ['priority', dbRow.priority, local.priority],
        ['resolution', dbRow.resolution, local.resolution],
        ['created_date', dbRow.created_date, local.created_date],
      ].filter(([, dbVal, localVal]) => (dbVal ?? null) !== (localVal ?? null));
      if (!jsonEquivalent(dbRow.extra_data || {}, local.extra_data || {})) {
        diffs.push(['extra_data', dbRow.extra_data, local.extra_data]);
      }
      if (diffs.length) sampleFailures.push({ issue_id: id, diffs });
    }

    const verificationFailed =
      staff_count !== 4 ||
      issue_count !== 92 ||
      perStaffMismatches.length > 0 ||
      orphanRes.rows.length > 0 ||
      dupeRes.rows.length > 0 ||
      prefixMismatchRes.rows.length > 0 ||
      missingFieldsRes.rows.length > 0 ||
      sampleFailures.length > 0;

    if (verificationFailed) {
      console.error('IN-TRANSACTION VERIFICATION FAILED — rolling back, nothing written.', {
        staff_count, issue_count,
        perStaffMismatches: perStaffMismatches.map((c) => ({ code: c, db: dbPerStaff[c] ?? 0, expected: expectedPerStaff[c] })),
        orphans: orphanRes.rows.length,
        duplicates: dupeRes.rows.length,
        prefixMismatches: prefixMismatchRes.rows.length,
        missingFields: missingFieldsRes.rows.length,
        sampleFailures,
      });
      await client.query('ROLLBACK');
      process.exit(1);
    }

    await client.query('COMMIT');
    console.log(`Migration committed. Staff: ${staffToInsert.length} inserted, ${staffPlan.length - staffToInsert.length} already present. Issues: ${issuesToInsert.length} inserted, ${issuePlan.length - issuesToInsert.length} already present.`);
    console.log(`Post-commit totals — staff: ${staff_count}, issues: ${issue_count}.`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection may already be closed */ }
    console.error('Migration failed — transaction rolled back. Nothing was written.');
    console.error(err.message); // never logs connectionString — pg error .message does not include it
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
