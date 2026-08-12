// scripts/import-historical-audio.ts
//
// STAGE 2 — imports the 52 confirmed historical MP3 recordings approved by the
// 144-Issue read-only audit, and links them to their 41 existing ND Issues.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run import:historical-audio -- --dry-run    (read-only pre-flight)
//   npm run import:historical-audio                 (upload + link)
//
// ── SAFETY MODEL ────────────────────────────────────────────────────────────
//  - PHASE 1 is entirely READ-ONLY and runs every time. It re-verifies the
//    source files, recomputes every SHA-256, re-checks the source -> live
//    mapping against the image migration manifest, and re-reads existing
//    attachments. ANY mismatch aborts before a single byte is uploaded.
//  - --dry-run stops after Phase 1.
//  - PHASE 2 uploads only recordings classified NEW, with a DETERMINISTIC
//    public_id and overwrite=false, so a rerun returns the existing asset
//    rather than duplicating it.
//  - PHASE 3 links inside ONE transaction with a full pre-COMMIT verification
//    block. Any failure ROLLS BACK and (best effort) deletes assets this run
//    uploaded.
//  - Issue rows are only ever UPDATEd on extra_data, additively. No INSERT, no
//    DELETE, no change to any other column, and never a whole-object replace.
//
// ── CONNECTION ──────────────────────────────────────────────────────────────
// Historical linking writes use MIGRATION_DB_URL, the established
// migration-write path (migration/migrate-issues.js uses the same). The
// identity check below runs before every write phase and aborts unless it sees
// exactly varmen_db / varmen_user. No connection string or credential is ever
// printed.

import { Client } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { deleteAttachments, isAttachmentStorageConfigured, uploadAttachment } from "../lib/cloudinary";
import type { StoredAttachment } from "../lib/access/attachments";

const DRY_RUN = process.argv.includes("--dry-run");

const REPO_ROOT = path.resolve(__dirname, "../..");
const SOURCE_ROOT = path.join(REPO_ROOT, "submission-html/Nanthini akka issues");
const IMAGE_MANIFEST = path.join(
  __dirname,
  "../migration/evidence/cloudinary-issue-image-manifest.json"
);
const OUT_MANIFEST = path.join(
  __dirname,
  "../migration/evidence/historical-issue-audio-manifest.json"
);

/** The audited set. Folder number -> live ND Issue. Excludes folders 10, 26,
 *  27, 28, 29 (no audio) and 14, 15 (no live Issue). Derived from the passed
 *  audit and re-asserted against the image manifest in Phase 1. */
const FOLDER_TO_ISSUE = new Map<number, string>();
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]) FOLDER_TO_ISSUE.set(n, nd(n));
for (const n of [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 30]) FOLDER_TO_ISSUE.set(n, nd(n - 2));
for (const n of [37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54])
  FOLDER_TO_ISSUE.set(n, nd(n - 8));

function nd(n: number): string {
  return `ND-${String(n).padStart(3, "0")}`;
}

const EXPECTED_RECORDINGS = 52;
const EXPECTED_ISSUES = 41;
const EXPECTED_HISTORICAL_ISSUES = 144;

let failures = 0;
function check(label: string, ok: boolean, detail: string): boolean {
  if (ok) console.log(`  PASS  ${label} — ${detail}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label} — ${detail}`);
  }
  return ok;
}

function abort(reason: string): never {
  console.error(`\nABORTED: ${reason}`);
  console.error("No uploads performed, no database rows written.");
  process.exit(1);
}

interface Candidate {
  liveIssueId: string;
  sourceFolder: string;
  filename: string;
  sourcePath: string;
  absolutePath: string;
  bytes: number;
  sha256: string;
  publicId: string;
  status: "NEW" | "ALREADY_LINKED" | "CONFLICT";
}

/** Opens a client on MIGRATION_DB_URL and refuses to continue unless it is
 *  varmen_db / varmen_user. Never logs the connection string. */
async function connectVerified(): Promise<Client> {
  const url = process.env.MIGRATION_DB_URL;
  if (!url) abort("MIGRATION_DB_URL is not set.");
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    keepAlive: true,
  });
  // Without this, an unhandled 'error' event on a dropped connection crashes
  // the process instead of surfacing as a rejected query.
  client.on("error", (error) => {
    console.error("  database connection error:", error.message);
  });
  await client.connect();
  const identity = await client.query<{ current_database: string; current_user: string }>(
    "SELECT current_database(), current_user"
  );
  const row = identity.rows[0];
  console.log(`  current_database: ${row.current_database} | current_user: ${row.current_user}`);
  if (row.current_database !== "varmen_db" || row.current_user !== "varmen_user") {
    await client.end();
    abort(`expected varmen_db/varmen_user, got ${row.current_database}/${row.current_user}`);
  }
  return client;
}

async function main(): Promise<void> {
  console.log(DRY_RUN ? "=== DRY RUN (read-only) ===\n" : "=== HISTORICAL AUDIO IMPORT ===\n");

  // ── PHASE 1 — read-only pre-flight ────────────────────────────────────────
  console.log("PHASE 1 — pre-import recheck (read-only)\n");
  const client = await connectVerified();

  // 1a. The historical dataset is still the proven 144.
  const counts = await client.query<{ total: string; historical: string; dupes: string }>(
    `SELECT (SELECT count(*)::text FROM issue_tracking.issues) AS total,
            (SELECT count(*)::text FROM issue_tracking.issues WHERE staff_code <> 'TS') AS historical,
            (SELECT count(*)::text FROM (
               SELECT issue_id FROM issue_tracking.issues GROUP BY issue_id HAVING count(*) > 1
             ) d) AS dupes`
  );
  const totalBefore = Number(counts.rows[0].total);
  check(
    "historical Issue count is 144",
    Number(counts.rows[0].historical) === EXPECTED_HISTORICAL_ISSUES,
    `${counts.rows[0].historical} historical of ${totalBefore} total`
  );
  check("no duplicate Issue IDs", Number(counts.rows[0].dupes) === 0, counts.rows[0].dupes);

  // 1b. Re-assert the mapping against the image migration manifest.
  const imageManifest: { sourcePath: string; liveIssueId: string }[] = JSON.parse(
    fs.readFileSync(IMAGE_MANIFEST, "utf8")
  );
  let manifestChecked = 0;
  let manifestConflicts = 0;
  for (const entry of imageManifest) {
    const folder = entry.sourcePath.split(/[\\/]/).slice(-2, -1)[0];
    const match = /^issues (\d+)$/.exec(folder ?? "");
    if (!match) continue;
    const expected = FOLDER_TO_ISSUE.get(Number(match[1]));
    if (expected === undefined) continue; // folder has no audio; not in scope
    manifestChecked += 1;
    if (expected !== entry.liveIssueId) {
      manifestConflicts += 1;
      console.error(`    CONFLICT ${folder}: audit says ${expected}, manifest says ${entry.liveIssueId}`);
    }
  }
  check(
    "source -> live mapping agrees with the image migration manifest",
    manifestConflicts === 0,
    `${manifestChecked} manifest rows cross-checked, ${manifestConflicts} conflict(s)`
  );

  // 1c. Collect the canonical MP3 set and recompute hashes.
  const candidates: Candidate[] = [];
  for (const [folderNumber, liveIssueId] of [...FOLDER_TO_ISSUE.entries()].sort((a, b) => a[0] - b[0])) {
    const folder = `issues ${folderNumber}`;
    const dir = path.join(SOURCE_ROOT, folder);
    if (!fs.existsSync(dir)) abort(`source folder missing: ${folder}`);
    const mp3s = fs
      .readdirSync(dir)
      .filter((f) => path.extname(f).toLowerCase() === ".mp3")
      .sort();
    if (mp3s.length === 0) abort(`no MP3 in ${folder}, but the audit expected at least one`);
    for (const filename of mp3s) {
      const absolutePath = path.join(dir, filename);
      const buffer = fs.readFileSync(absolutePath);
      candidates.push({
        liveIssueId,
        sourceFolder: folder,
        filename,
        sourcePath: path
          .relative(REPO_ROOT, absolutePath)
          .replace(/\\/g, "/"),
        absolutePath,
        bytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        // Deterministic, and matching the historical image folder convention.
        publicId: `issue-tracker/${liveIssueId}/${path.basename(filename, ".mp3")}`,
        status: "NEW",
      });
    }
  }

  const issuesTouched = new Set(candidates.map((c) => c.liveIssueId));
  check(
    `canonical recordings = ${EXPECTED_RECORDINGS}`,
    candidates.length === EXPECTED_RECORDINGS,
    `${candidates.length} MP3 file(s) found`
  );
  check(
    `target Issues = ${EXPECTED_ISSUES}`,
    issuesTouched.size === EXPECTED_ISSUES,
    `${issuesTouched.size} distinct Issue(s)`
  );
  check(
    "no OGG in the import set",
    candidates.every((c) => c.filename.toLowerCase().endsWith(".mp3")),
    "MP3 only"
  );
  check(
    "every SHA-256 is distinct",
    new Set(candidates.map((c) => c.sha256)).size === candidates.length,
    `${new Set(candidates.map((c) => c.sha256)).size} distinct hashes`
  );

  // 1d. Every target Issue exists, is historical, and is an ND row.
  const targets = await client.query<{ issue_id: string; staff_code: string }>(
    `SELECT issue_id, staff_code FROM issue_tracking.issues WHERE issue_id = ANY($1::text[])`,
    [[...issuesTouched]]
  );
  check(
    "every target Issue exists",
    targets.rows.length === issuesTouched.size,
    `${targets.rows.length} of ${issuesTouched.size} found`
  );
  check(
    "every target is a historical (non-TS) ND Issue",
    targets.rows.every((r) => r.staff_code === "ND"),
    `staff codes: ${[...new Set(targets.rows.map((r) => r.staff_code))].join(", ")}`
  );

  // 1e. Existing attachments — classify NEW / ALREADY LINKED / CONFLICT.
  const existing = await client.query<{ issue_id: string; attachments: unknown }>(
    `SELECT issue_id, extra_data->'attachments' AS attachments
     FROM issue_tracking.issues WHERE issue_id = ANY($1::text[])`,
    [[...issuesTouched]]
  );
  const existingByIssue = new Map<string, { public_id?: string; sha256?: string }[]>();
  for (const row of existing.rows) {
    existingByIssue.set(row.issue_id, Array.isArray(row.attachments) ? (row.attachments as []) : []);
  }
  for (const c of candidates) {
    const already = existingByIssue.get(c.liveIssueId) ?? [];
    if (already.some((a) => a.public_id === c.publicId || a.sha256 === c.sha256)) {
      c.status = "ALREADY_LINKED";
    }
  }
  const newOnes = candidates.filter((c) => c.status === "NEW");
  const alreadyLinked = candidates.filter((c) => c.status === "ALREADY_LINKED");
  const conflicts = candidates.filter((c) => c.status === "CONFLICT");
  console.log(
    `  INFO  NEW=${newOnes.length}  ALREADY_LINKED=${alreadyLinked.length}  CONFLICT=${conflicts.length}`
  );
  check("no mapping conflicts", conflicts.length === 0, `${conflicts.length}`);

  // 1f. Baselines that must not move.
  const baseline = await client.query<{ img_issues: string; img_total: string; ts_att: string }>(
    `SELECT
       (SELECT count(*)::text FROM issue_tracking.issues
         WHERE jsonb_typeof(extra_data->'images') = 'array') AS img_issues,
       (SELECT COALESCE(sum(jsonb_array_length(extra_data->'images')),0)::text
          FROM issue_tracking.issues WHERE jsonb_typeof(extra_data->'images') = 'array') AS img_total,
       (SELECT COALESCE(jsonb_array_length(extra_data->'attachments'),0)::text
          FROM issue_tracking.issues WHERE issue_id = 'TS-002') AS ts_att`
  );
  const imgIssuesBefore = Number(baseline.rows[0].img_issues);
  const imgTotalBefore = Number(baseline.rows[0].img_total);
  const tsAttBefore = Number(baseline.rows[0].ts_att);
  console.log(
    `  INFO  baseline: ${imgIssuesBefore} Issues with images, ${imgTotalBefore} images, TS-002 attachments=${tsAttBefore}`
  );

  if (failures > 0) {
    await client.end();
    abort(`${failures} pre-flight check(s) failed.`);
  }
  console.log("\n  Pre-flight clean.");

  if (DRY_RUN) {
    console.log("\nDRY RUN — stopping before upload. Nothing was uploaded or written.");
    console.log("\nPlanned import:");
    for (const c of candidates)
      console.log(`  ${c.liveIssueId}  ${c.sourceFolder.padEnd(11)} ${c.filename.padEnd(30)} ${String(c.bytes).padStart(8)}B  ${c.status}`);
    await client.end();
    return;
  }

  // ── PHASE 2 — upload ──────────────────────────────────────────────────────
  //
  // The database connection is CLOSED first and reopened in Phase 3. Uploading
  // 52 files takes minutes, and a Postgres connection left idle that long is
  // dropped by the server — which is exactly what happened on the first run
  // (assets uploaded, connection dead before BEGIN, no rows written). Holding
  // no connection across the slow phase removes that failure mode entirely.
  console.log("\nPHASE 2 — Cloudinary upload\n");
  await client.end();

  if (!isAttachmentStorageConfigured()) {
    abort("attachment storage is not configured.");
  }

  const uploadedThisRun: StoredAttachment[] = [];
  const attachmentsByIssue = new Map<string, (StoredAttachment & { sha256: string })[]>();

  for (const c of candidates) {
    if (c.status === "ALREADY_LINKED") continue;
    try {
      const stored = await uploadAttachment({
        kind: "audio",
        // Marks these as historical so the UI can distinguish them from audio
        // attached through Add New Issue.
        source: "historical",
        originalName: c.filename,
        declaredType: "audio/mpeg",
        bytes: new Uint8Array(fs.readFileSync(c.absolutePath)),
        publicId: c.publicId,
      });
      uploadedThisRun.push(stored);
      const list = attachmentsByIssue.get(c.liveIssueId) ?? [];
      list.push({ ...stored, source: "historical", sha256: c.sha256 });
      attachmentsByIssue.set(c.liveIssueId, list);
      console.log(`  uploaded  ${c.liveIssueId}  ${c.filename}`);
    } catch (error) {
      console.error(`  UPLOAD FAILED  ${c.liveIssueId}  ${c.filename}`);
      console.error("  cleaning up assets uploaded during this run…");
      await deleteAttachments(uploadedThisRun);
      abort(`upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\n  ${uploadedThisRun.length} asset(s) uploaded.`);

  // ── PHASE 3 — link, in ONE transaction ────────────────────────────────────
  console.log("\nPHASE 3 — database linking (single transaction)\n");
  const writeClient = await connectVerified();
  try {
    await writeClient.query("BEGIN");

    for (const [issueId, attachments] of attachmentsByIssue) {
      // Additive by construction: `extra_data || jsonb_build_object(...)`
      // replaces ONLY the attachments key and preserves every sibling
      // (images, member, rootCause, …). The new array is appended to whatever
      // is already there rather than replacing it.
      await writeClient.query(
        `UPDATE issue_tracking.issues
         SET extra_data = extra_data || jsonb_build_object(
               'attachments',
               COALESCE(extra_data->'attachments', '[]'::jsonb) || $2::jsonb
             )
         WHERE issue_id = $1`,
        [issueId, JSON.stringify(attachments)]
      );
    }

    // ── Pre-COMMIT verification ─────────────────────────────────────────────
    const after = await writeClient.query<{
      total: string;
      historical: string;
      dupes: string;
      img_issues: string;
      img_total: string;
      ts_att: string;
      audio_issues: string;
      audio_total: string;
      ogg: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM issue_tracking.issues) AS total,
         (SELECT count(*)::text FROM issue_tracking.issues WHERE staff_code <> 'TS') AS historical,
         (SELECT count(*)::text FROM (
            SELECT issue_id FROM issue_tracking.issues GROUP BY issue_id HAVING count(*) > 1) d) AS dupes,
         (SELECT count(*)::text FROM issue_tracking.issues
           WHERE jsonb_typeof(extra_data->'images') = 'array') AS img_issues,
         (SELECT COALESCE(sum(jsonb_array_length(extra_data->'images')),0)::text
            FROM issue_tracking.issues WHERE jsonb_typeof(extra_data->'images') = 'array') AS img_total,
         (SELECT COALESCE(jsonb_array_length(extra_data->'attachments'),0)::text
            FROM issue_tracking.issues WHERE issue_id = 'TS-002') AS ts_att,
         (SELECT count(*)::text FROM issue_tracking.issues i
           WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(i.extra_data->'attachments','[]'::jsonb)) a
                          WHERE a->>'source' = 'historical')) AS audio_issues,
         (SELECT count(*)::text FROM issue_tracking.issues i,
            LATERAL jsonb_array_elements(COALESCE(i.extra_data->'attachments','[]'::jsonb)) a
           WHERE a->>'source' = 'historical') AS audio_total,
         (SELECT count(*)::text FROM issue_tracking.issues i,
            LATERAL jsonb_array_elements(COALESCE(i.extra_data->'attachments','[]'::jsonb)) a
           WHERE a->>'source' = 'historical' AND a->>'original_name' ILIKE '%.ogg') AS ogg`
    );
    const a = after.rows[0];

    const verified =
      check("Issue count unchanged", Number(a.total) === totalBefore, `${a.total}`) &&
      check("historical count still 144", Number(a.historical) === EXPECTED_HISTORICAL_ISSUES, a.historical) &&
      check("no duplicate Issue IDs", Number(a.dupes) === 0, a.dupes) &&
      check("image Issues unchanged", Number(a.img_issues) === imgIssuesBefore, `${a.img_issues}`) &&
      check("image count unchanged", Number(a.img_total) === imgTotalBefore, `${a.img_total}`) &&
      check("TS-002 attachments unchanged", Number(a.ts_att) === tsAttBefore, `${a.ts_att}`) &&
      check(`${EXPECTED_ISSUES} Issues carry historical audio`, Number(a.audio_issues) === EXPECTED_ISSUES, a.audio_issues) &&
      check(`${EXPECTED_RECORDINGS} historical recordings linked`, Number(a.audio_total) === EXPECTED_RECORDINGS, a.audio_total) &&
      check("no OGG linked", Number(a.ogg) === 0, a.ogg);

    if (!verified) {
      await writeClient.query("ROLLBACK");
      console.error("\n  Verification failed — transaction ROLLED BACK.");
      await deleteAttachments(uploadedThisRun);
      await writeClient.end();
      abort("pre-COMMIT verification failed.");
    }

    await writeClient.query("COMMIT");
    console.log("\n  COMMIT.");
  } catch (error) {
    await writeClient.query("ROLLBACK").catch(() => {});
    console.error("\n  Transaction error — ROLLED BACK.");
    await deleteAttachments(uploadedThisRun);
    await writeClient.end();
    abort(error instanceof Error ? error.message : String(error));
  }

  // ── PHASE 4 — manifest ────────────────────────────────────────────────────
  const manifest = candidates.map((c) => {
    const stored = (attachmentsByIssue.get(c.liveIssueId) ?? []).find((s) => s.sha256 === c.sha256);
    return {
      liveIssueId: c.liveIssueId,
      sourceFolder: c.sourceFolder,
      original_name: c.filename,
      sourcePath: c.sourcePath,
      sha256: c.sha256,
      public_id: stored?.public_id ?? c.publicId,
      secure_url: stored?.url ?? null,
      mime_type: "audio/mpeg",
      size: c.bytes,
      source: "historical",
      state: c.status,
    };
  });
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nPHASE 4 — manifest written: ${manifest.length} row(s)`);

  await writeClient.end();
  console.log("\nDONE.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
