// scripts/verify-historical-audio.ts
//
// READ-ONLY verification of the historical audio import.
//
// Usage (manual only — never wired into build/dev/start):
//   npm run verify:historical-audio
//
// Verifies EVERY one of the 41 affected Issues and all 52 recordings — not a
// sample. Traces each link in both directions:
//
//   source MP3 on disk (SHA-256)
//     -> manifest row
//       -> Cloudinary asset (HTTP HEAD, no download)
//         -> extra_data.attachments entry
//           -> correct live Issue
//
// Issues SELECT statements only. No INSERT/UPDATE/DELETE/DDL, and it proves
// that by comparing row counts before and after.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { getPool, query } from "../lib/db";

const REPO_ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(__dirname, "../migration/evidence/historical-issue-audio-manifest.json");

const EXPECTED_RECORDINGS = 52;
const EXPECTED_ISSUES = 41;
const EXPECTED_HISTORICAL = 144;

let failures = 0;
function check(label: string, ok: boolean, detail: string): void {
  if (ok) console.log(`  PASS  ${label} — ${detail}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label} — ${detail}`);
  }
}

interface ManifestRow {
  liveIssueId: string;
  sourceFolder: string;
  original_name: string;
  sourcePath: string;
  sha256: string;
  public_id: string;
  secure_url: string | null;
  mime_type: string;
  size: number;
  source: string;
}

interface StoredAudio {
  type?: string;
  url?: string;
  public_id?: string;
  original_name?: string;
  source?: string;
  sha256?: string;
  bytes?: number;
}

async function counts() {
  const r = await query<{
    total: string;
    historical: string;
    img_issues: string;
    img_total: string;
  }>(
    `SELECT (SELECT count(*)::text FROM issue_tracking.issues) AS total,
            (SELECT count(*)::text FROM issue_tracking.issues WHERE staff_code <> 'TS') AS historical,
            (SELECT count(*)::text FROM issue_tracking.issues
              WHERE jsonb_typeof(extra_data->'images') = 'array') AS img_issues,
            (SELECT COALESCE(sum(jsonb_array_length(extra_data->'images')),0)::text
               FROM issue_tracking.issues WHERE jsonb_typeof(extra_data->'images') = 'array') AS img_total`
  );
  return r.rows[0];
}

async function main(): Promise<void> {
  const identity = await query<{ current_database: string; current_user: string }>(
    "SELECT current_database(), current_user"
  );
  console.log(
    `current_database: ${identity.rows[0].current_database} | current_user: ${identity.rows[0].current_user}\n`
  );

  const before = await counts();
  const manifest: ManifestRow[] = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

  console.log("1. Manifest");
  check(`${EXPECTED_RECORDINGS} rows`, manifest.length === EXPECTED_RECORDINGS, `${manifest.length}`);
  check(
    `${EXPECTED_ISSUES} distinct Issues`,
    new Set(manifest.map((m) => m.liveIssueId)).size === EXPECTED_ISSUES,
    `${new Set(manifest.map((m) => m.liveIssueId)).size}`
  );
  check("every row is MP3", manifest.every((m) => m.original_name.toLowerCase().endsWith(".mp3")), "no OGG");
  check("every row source=historical", manifest.every((m) => m.source === "historical"), "ok");
  check("every row has an https URL", manifest.every((m) => /^https:\/\//.test(m.secure_url ?? "")), "ok");
  const secretPattern = /(api_secret|api_key|password|CLOUDINARY_API|postgres:\/\/|postgresql:\/\/)/i;
  check(
    "manifest contains no credential-like strings",
    !secretPattern.test(fs.readFileSync(MANIFEST, "utf8")),
    "secret scan clean"
  );

  console.log("\n2. Source files still match the recorded hashes");
  let hashMismatch = 0;
  let missing = 0;
  for (const row of manifest) {
    const abs = path.join(REPO_ROOT, row.sourcePath);
    if (!fs.existsSync(abs)) {
      missing += 1;
      continue;
    }
    const sha = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
    if (sha !== row.sha256) hashMismatch += 1;
  }
  check("every source file still exists", missing === 0, `${missing} missing`);
  check("every SHA-256 still matches", hashMismatch === 0, `${hashMismatch} mismatch(es)`);

  console.log("\n3. Database linkage — ALL 41 Issues");
  const rows = await query<{ issue_id: string; attachments: StoredAudio[] | null; images: unknown }>(
    `SELECT issue_id, extra_data->'attachments' AS attachments, extra_data->'images' AS images
     FROM issue_tracking.issues WHERE staff_code <> 'TS' ORDER BY issue_id`
  );
  const linked = new Map<string, StoredAudio[]>();
  for (const r of rows.rows) {
    const historical = (Array.isArray(r.attachments) ? r.attachments : []).filter(
      (a) => a.source === "historical"
    );
    if (historical.length > 0) linked.set(r.issue_id, historical);
  }
  check(`${EXPECTED_ISSUES} Issues carry historical audio`, linked.size === EXPECTED_ISSUES, `${linked.size}`);
  const linkedTotal = [...linked.values()].reduce((n, a) => n + a.length, 0);
  check(`${EXPECTED_RECORDINGS} recordings linked`, linkedTotal === EXPECTED_RECORDINGS, `${linkedTotal}`);

  // Per-Issue counts must match the manifest exactly — every Issue checked.
  const expectedPerIssue = new Map<string, number>();
  for (const m of manifest) expectedPerIssue.set(m.liveIssueId, (expectedPerIssue.get(m.liveIssueId) ?? 0) + 1);
  let countMismatch = 0;
  for (const [issueId, expected] of expectedPerIssue) {
    if ((linked.get(issueId)?.length ?? 0) !== expected) {
      countMismatch += 1;
      console.error(`    ${issueId}: expected ${expected}, found ${linked.get(issueId)?.length ?? 0}`);
    }
  }
  check("per-Issue recording counts match the manifest", countMismatch === 0, `${expectedPerIssue.size} Issues checked`);

  // Every manifest row is present on its own Issue, by public_id.
  let missingLink = 0;
  let wrongIssue = 0;
  for (const m of manifest) {
    const onIssue = linked.get(m.liveIssueId) ?? [];
    if (!onIssue.some((a) => a.public_id === m.public_id)) missingLink += 1;
    for (const [issueId, list] of linked) {
      if (issueId !== m.liveIssueId && list.some((a) => a.public_id === m.public_id)) wrongIssue += 1;
    }
  }
  check("every recording is linked to its own Issue", missingLink === 0, `${missingLink} missing`);
  check("no recording is linked to the wrong Issue", wrongIssue === 0, `${wrongIssue} misplaced`);

  const allHistorical = [...linked.values()].flat();
  check(
    "no duplicate attachment records",
    new Set(allHistorical.map((a) => a.public_id)).size === allHistorical.length,
    `${new Set(allHistorical.map((a) => a.public_id)).size} distinct public_ids`
  );
  check("every linked recording is audio", allHistorical.every((a) => a.type === "audio"), "ok");
  check(
    "no OGG linked",
    !allHistorical.some((a) => (a.original_name ?? "").toLowerCase().endsWith(".ogg")),
    "ok"
  );

  console.log("\n4. Historical data untouched");
  check("historical Issue count still 144", Number(before.historical) === EXPECTED_HISTORICAL, before.historical);
  check("Issues with images unchanged (40)", Number(before.img_issues) === 40, before.img_issues);
  check("image count unchanged (64)", Number(before.img_total) === 64, before.img_total);
  const siblings = await query<{ n: string }>(
    `SELECT count(*)::text n FROM issue_tracking.issues
     WHERE staff_code <> 'TS' AND jsonb_typeof(extra_data) <> 'object'`
  );
  check("every extra_data is still a JSON object", Number(siblings.rows[0].n) === 0, siblings.rows[0].n);
  const keysKept = await query<{ n: string }>(
    `SELECT count(*)::text n FROM issue_tracking.issues
     WHERE extra_data ? 'attachments' AND extra_data ? 'images'`
  );
  console.log(`  INFO  Issues carrying BOTH images and attachments: ${keysKept.rows[0].n}`);
  const ts = await query<{ issue_id: string; n: string }>(
    `SELECT issue_id, COALESCE(jsonb_array_length(extra_data->'attachments'),0)::text n
     FROM issue_tracking.issues WHERE staff_code = 'TS' ORDER BY issue_id`
  );
  check(
    "TS rows unchanged",
    ts.rows.every((r) => (r.issue_id === "TS-002" ? r.n === "1" : r.n === "0")),
    ts.rows.map((r) => `${r.issue_id}=${r.n}`).join(", ")
  );

  console.log("\n5. Cloudinary assets reachable (HEAD only, no download)");
  let unreachable = 0;
  let checked = 0;
  for (const m of manifest) {
    if (!m.secure_url) continue;
    checked += 1;
    try {
      const response = await fetch(m.secure_url, { method: "HEAD" });
      if (!response.ok) {
        unreachable += 1;
        console.error(`    ${m.liveIssueId} ${m.original_name}: HTTP ${response.status}`);
      }
    } catch {
      unreachable += 1;
      console.error(`    ${m.liveIssueId} ${m.original_name}: request failed`);
    }
  }
  check("every Cloudinary asset responds", unreachable === 0, `${checked} checked, ${unreachable} unreachable`);

  console.log("\n6. Read-only");
  const after = await counts();
  check("nothing was written", JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));

  await (await getPool()).end();

  if (failures > 0) {
    console.error(`\nFAILED — ${failures} check(s).`);
    process.exit(1);
  }
  console.log(`\nAll checks passed. ${EXPECTED_RECORDINGS} recordings across ${EXPECTED_ISSUES} Issues verified.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
