import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MOBILE_CATEGORY,
  MOBILE_DESCRIPTION,
  MOBILE_SOURCE_KEY,
  MOBILE_SOURCE_VALUE,
  MOBILE_STAFF_CODE,
  MOBILE_SUBMISSION_KEY,
  buildMobileExtraData,
  buildMobileIssueTitle,
  isAssetInSubmission,
  verifySubmittedAsset,
  verifySubmittedAssets,
  type SubmittedAsset,
} from "../lib/mobile/mobileRegistration";
import { buildMobilePublicId } from "../lib/mobile/mobileAccess";
import { readAudioAttachments, ASSIGNEE_VISIBLE_SOURCES } from "../lib/access/attachments";

// Warehouse Mobile Lite — Stage 5 registration rules.
//
// Pure: no database, no Cloudinary, no session. NOTHING here writes to
// PostgreSQL, and no Issue, staff row or asset is created.

const SUBMISSION = "0b6a3d2e-1c4f-4a7b-9e2d-8f5c1a3b7d90";
const OTHER_SUBMISSION = "11111111-2222-4333-8444-555555555555";
const ATTEMPT = "7c1e5a94-2b6d-4f83-9a10-3e8b2d6c4f57";

function photo(slot: "photo1" | "photo2", over: Partial<SubmittedAsset> = {}): SubmittedAsset {
  return {
    publicId: buildMobilePublicId(SUBMISSION, slot, ATTEMPT),
    secureUrl: "https://res.cloudinary.com/demo/a.jpg",
    bytes: 1_500_000,
    format: "jpg",
    resourceType: "image",
    ...over,
  };
}

function voice(over: Partial<SubmittedAsset> = {}): SubmittedAsset {
  return {
    publicId: buildMobilePublicId(SUBMISSION, "voice", ATTEMPT),
    secureUrl: "https://res.cloudinary.com/demo/a.webm",
    bytes: 400_000,
    format: "webm",
    resourceType: "video",
    ...over,
  };
}

function allAssets() {
  return { voice: voice(), photo1: photo("photo1"), photo2: photo("photo2") };
}

describe("Stage 5 — server-derived Issue fields", () => {
  it("Raised By is the WH system reporter", () => {
    assert.equal(MOBILE_STAFF_CODE, "WH");
  });

  it("Domain is the existing canonical inventory value", () => {
    assert.equal(MOBILE_CATEGORY, "inventory");
    assert.equal(MOBILE_CATEGORY, MOBILE_CATEGORY.toLowerCase());
  });

  it("title is derived from the clock and carries NO username", () => {
    const title = buildMobileIssueTitle(new Date(2026, 7, 14, 9, 5));
    assert.equal(title, "Warehouse report — 14/08/2026 09:05");
    for (const name of ["arun", "suman", "manoranjani", "admin"]) {
      assert.equal(title.toLowerCase().includes(name), false);
    }
  });

  it("description is fixed and names the recording as the evidence", () => {
    assert.match(MOBILE_DESCRIPTION, /voice recording is the primary issue evidence/);
    assert.ok(MOBILE_DESCRIPTION.length > 0);
  });
});

describe("Stage 5 — asset verification refuses anything not ours", () => {
  it("accepts three well-formed assets", () => {
    assert.deepEqual(verifySubmittedAssets(SUBMISSION, allAssets()), { ok: true });
  });

  it("rejects a missing voice", () => {
    const assets = { ...allAssets(), voice: null };
    const result = verifySubmittedAssets(SUBMISSION, assets);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Missing voice/);
  });

  it("rejects a missing photo1", () => {
    const result = verifySubmittedAssets(SUBMISSION, { ...allAssets(), photo1: undefined });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Missing photo1/);
  });

  it("rejects a missing photo2", () => {
    const result = verifySubmittedAssets(SUBMISSION, { ...allAssets(), photo2: null });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Missing photo2/);
  });

  it("rejects an ARBITRARY Cloudinary public id", () => {
    for (const publicId of [
      "issue-tracker/intake/some-desktop-upload",
      "some-other-account-asset",
      "issue-tracker/ND-001/recording-001",
      "",
    ]) {
      const result = verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", { publicId }));
      assert.equal(result.ok, false, `${publicId} must be rejected`);
    }
  });

  it("rejects an asset from ANOTHER submission's namespace", () => {
    const foreign = photo("photo1", {
      publicId: buildMobilePublicId(OTHER_SUBMISSION, "photo1", ATTEMPT),
    });
    assert.equal(verifySubmittedAsset("photo1", SUBMISSION, foreign).ok, false);
  });

  it("rejects an asset submitted under the WRONG slot", () => {
    const swapped = photo("photo2", {
      publicId: buildMobilePublicId(SUBMISSION, "photo2", ATTEMPT),
    });
    assert.equal(verifySubmittedAsset("photo1", SUBMISSION, swapped).ok, false);
  });

  it("rejects the WRONG resource type", () => {
    assert.equal(
      verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", { resourceType: "video" })).ok,
      false
    );
    assert.equal(verifySubmittedAsset("voice", SUBMISSION, voice({ resourceType: "image" })).ok, false);
  });

  it("rejects a disallowed format", () => {
    assert.equal(verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", { format: "heic" })).ok, false);
    assert.equal(verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", { format: "png" })).ok, false);
    assert.equal(verifySubmittedAsset("voice", SUBMISSION, voice({ format: "exe" })).ok, false);
  });

  it("rejects an oversized asset", () => {
    assert.equal(verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", { bytes: 6_000_000 })).ok, false);
    assert.equal(verifySubmittedAsset("voice", SUBMISSION, voice({ bytes: 6_000_000 })).ok, false);
  });

  it("rejects a non-https url", () => {
    assert.equal(
      verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", { secureUrl: "http://x/a.jpg" })).ok,
      false
    );
  });

  it("rejects a path with extra segments or a bad attempt id", () => {
    assert.equal(
      verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", {
        publicId: `issue-tracker/mobile/${SUBMISSION}/photo1/${ATTEMPT}/extra`,
      })).ok,
      false
    );
    assert.equal(
      verifySubmittedAsset("photo1", SUBMISSION, photo("photo1", {
        publicId: `issue-tracker/mobile/${SUBMISSION}/photo1/not-a-uuid`,
      })).ok,
      false
    );
  });

  it("rejects everything when the submission id itself is invalid", () => {
    assert.equal(verifySubmittedAssets("not-a-uuid", allAssets()).ok, false);
  });
});

describe("Stage 5 — cleanup is bounded to this submission's namespace", () => {
  it("recognises only assets inside this submission", () => {
    assert.equal(isAssetInSubmission(buildMobilePublicId(SUBMISSION, "voice", ATTEMPT), SUBMISSION), true);
  });

  it("refuses another submission, the desktop intake folder and historical assets", () => {
    for (const publicId of [
      buildMobilePublicId(OTHER_SUBMISSION, "voice", ATTEMPT),
      "issue-tracker/intake/photo",
      "issue-tracker/ND-001/recording-001",
      "",
      "../../anything",
    ]) {
      assert.equal(isAssetInSubmission(publicId, SUBMISSION), false, `${publicId} must be out of scope`);
    }
  });
});

describe("Stage 5 — extra_data matches what the Web Issue Tracker already reads", () => {
  const extra = buildMobileExtraData(SUBMISSION, allAssets());

  it("writes the legacy three-key images shape the existing gallery renders", () => {
    const images = extra.images as Array<Record<string, unknown>>;
    assert.equal(images.length, 2);
    for (const image of images) {
      assert.deepEqual(Object.keys(image).sort(), ["original_name", "public_id", "url"]);
    }
  });

  it("writes all three assets into attachments, with the recording marked as a voice recording", () => {
    const attachments = extra.attachments as Array<Record<string, unknown>>;
    assert.equal(attachments.length, 3);
    assert.equal(attachments[0].type, "audio");
    assert.equal(attachments[0].source, "voice_recording");
  });

  it("the existing audio reader can consume it, and BOTH portals may see it", () => {
    const audio = readAudioAttachments(extra.attachments, ASSIGNEE_VISIBLE_SOURCES);
    assert.equal(audio.length, 1);
    assert.equal(audio[0].source, "voice_recording");
    assert.ok(audio[0].url.startsWith("https://"));
  });

  it("persists the submission id for idempotency, and the source marker", () => {
    assert.equal(extra[MOBILE_SUBMISSION_KEY], SUBMISSION);
    assert.equal(extra[MOBILE_SOURCE_KEY], MOBILE_SOURCE_VALUE);
    assert.equal(MOBILE_SOURCE_VALUE, "warehouse-mobile-lite");
  });

  it("invents NO worker identity — the login-free design has none", () => {
    const serialized = JSON.stringify(extra).toLowerCase();
    for (const forbidden of ["username", "userid", "reporter", "member", "staffname"]) {
      assert.equal(serialized.includes(forbidden), false, `extra_data must not carry "${forbidden}"`);
    }
  });

  it("adds only two Mobile Lite keys beyond the existing media structures", () => {
    assert.deepEqual(Object.keys(extra).sort(), [
      "attachments",
      "images",
      MOBILE_SOURCE_KEY,
      MOBILE_SUBMISSION_KEY,
    ].sort());
  });
});

describe("Stage 5 — the registration action and query path (source evidence)", () => {
  const actionSource = readFileSync(join(process.cwd(), "app/mobile/register-actions.ts"), "utf8");
  const issuesSource = readFileSync(join(process.cwd(), "lib/queries/issues.ts"), "utf8");
  const captureSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");

  it("requires a signed-in user holding mobile:submit before anything else", () => {
    // SUPERSEDED: this used to accept the anonymous `wh_mobile` session. The
    // owner has replaced that with the ordinary Tracker login, so the gate is
    // now a real user and a real permission.
    assert.ok(actionSource.includes("await getCurrentUser()"));
    assert.ok(actionSource.includes('hasPermission(user, "mobile:submit")'));
    // Compare CALL SITES, not the import list at the top of the file.
    assert.ok(
      actionSource.indexOf("await getCurrentUser()") <
        actionSource.indexOf("verifyMobileTimeline(input.submissionId")
    );
  });

  it("no longer trusts the deleted anonymous Mobile session", () => {
    for (const forbidden of ["readMobileSession", "mobileSession", "wh_mobile"]) {
      assert.equal(
        actionSource.includes(forbidden),
        false,
        `the registration action must not reference ${forbidden}`
      );
    }
  });

  it("derives staff code, category and title server-side", () => {
    // STAGE 2: the description is now composed from the worker's own text and
    // captions (see tests/mobileTimeline.test.ts) instead of being a constant.
    // Everything else is still derived here or by the database.
    // SUPERSEDED: this used to be the generic WH constant. The raiser is now
    // the signed-in account's own linked issue_staff row, resolved server-side.
    assert.ok(actionSource.includes("staffCode: raiser.staffCode"));
    assert.ok(actionSource.includes("findRaiserForUser(user.userId)"));
    assert.ok(actionSource.includes("category: MOBILE_CATEGORY"));
    assert.ok(actionSource.includes("title: buildMobileIssueTitle(new Date())"));
    assert.ok(actionSource.includes("description: buildMobileDescription(timeline.items)"));
  });

  it("reads NO client value for any Issue field", () => {
    for (const forbidden of ["input.title", "input.description", "input.category", "input.staffCode", "input.status", "input.priority"]) {
      assert.equal(actionSource.includes(forbidden), false, `must not read ${forbidden}`);
    }
  });

  it("never falls back to another staff code", () => {
    for (const code of ['"ND"', '"SA"', '"ST"', '"NV"', '"AT"']) {
      assert.equal(actionSource.includes(code), false, `must not reference staff code ${code}`);
    }
    assert.ok(actionSource.includes("InvalidStaffError"));
  });

  it("uses the existing Issue ID generator through the shared statements", () => {
    assert.ok(issuesSource.includes("issue_tracking.next_issue_id($1)"));
    assert.ok(issuesSource.includes("export async function createIssueTx"));
    assert.ok(issuesSource.includes("await createIssueTx(client,"));
  });

  it("still hard-codes RED and CURRENT_DATE in the one shared INSERT", () => {
    assert.equal((issuesSource.match(/VALUES \(\$1, \$2, \$3, \$4, \$5, 'RED', \$6, \$7, CURRENT_DATE/g) ?? []).length, 2);
  });

  it("takes an advisory lock and looks the submission up before inserting", () => {
    assert.ok(issuesSource.includes("SELECT pg_advisory_xact_lock(hashtext($1))"));
    assert.ok(issuesSource.includes("extra_data->>'mobileSubmissionId' = $1"));
    assert.ok(issuesSource.includes("alreadyRegistered: true"));
  });

  it("uses parameterised SQL and fully qualified tables", () => {
    assert.ok(issuesSource.includes("FROM issue_tracking.issues"));
    assert.equal(issuesSource.includes("${input.submissionId}"), false);
  });

  it("introduces no schema change or migration", () => {
    for (const forbidden of ["CREATE TABLE", "ALTER TABLE", "DROP TABLE", "CREATE INDEX", "TRUNCATE"]) {
      assert.equal(issuesSource.includes(forbidden), false, `must not contain ${forbidden}`);
      assert.equal(actionSource.includes(forbidden), false, `must not contain ${forbidden}`);
    }
  });

  it("cleans up only namespace-checked superseded assets, after success", () => {
    assert.ok(actionSource.includes("isAssetInSubmission(asset.publicId, input.submissionId)"));
    // Cleanup happens after the issue id is obtained, never before.
    assert.ok(actionSource.indexOf("createMobileIssue") < actionSource.indexOf("deleteAttachments"));
  });

  it("does NOT delete active media when registration fails", () => {
    const failureBlock = actionSource.slice(
      actionSource.indexOf("} catch (error) {"),
      actionSource.indexOf("// ── Cleanup")
    );
    assert.equal(failureBlock.includes("deleteAttachments"), false);
  });

  it("the client guards against a double tap and shows the REAL id", () => {
    // STAGE 2: send opens a confirmation and only "Yes, Send Issue" writes, so
    // the guard lives in confirmSend() and the result is a chat reply carrying
    // whatever id the database returned.
    assert.ok(captureSource.includes("if (registering || !isDraftSendable(draft)) return;"));
    assert.ok(captureSource.includes("Issue ID: {issue.issueId}"));
    assert.ok(captureSource.includes("Issue Registered"));
  });

  it("the client keeps the same submission id for a retry", () => {
    // A new id is minted in exactly ONE place — starting the next Issue after a
    // success. A failed attempt never reaches it, so a retry re-sends under the
    // same id and the server's idempotency returns the same Issue.
    assert.equal((captureSource.match(/setSubmissionId\(/g) ?? []).length, 1);
    const next = captureSource.slice(
      captureSource.indexOf("function startNextIssue()"),
      captureSource.indexOf("// ── render")
    );
    assert.ok(next.includes("setSubmissionId(crypto.randomUUID());"));
    const body = captureSource.slice(
      captureSource.indexOf("async function confirmSend()"),
      captureSource.indexOf("function startNextIssue")
    );
    const failureBranch = body.slice(body.indexOf("} else {"), body.indexOf("} catch {"));
    assert.equal(failureBranch.includes("setSubmissionId"), false, "a failure keeps the id");
  });

  it("still offers no fifth worker action", () => {
    for (const forbidden of ["Start a new report", "New report", "Reset report", "Clear all"]) {
      assert.equal(captureSource.includes(forbidden), false);
    }
  });
});

describe("Stage 5 — PWA manifest", () => {
  const manifestSource = readFileSync(join(process.cwd(), "app/manifest.ts"), "utf8");
  const layoutSource = readFileSync(join(process.cwd(), "app/mobile/layout.tsx"), "utf8");

  it("names the app and installs standalone at /mobile", () => {
    assert.ok(manifestSource.includes('name: "Warehouse Mobile Lite"'));
    assert.ok(manifestSource.includes('display: "standalone"'));
    assert.ok(manifestSource.includes('start_url: "/mobile"'));
    assert.ok(manifestSource.includes('scope: "/mobile"'));
  });

  it("declares theme and background colours and an icon set", () => {
    assert.ok(manifestSource.includes("background_color"));
    assert.ok(manifestSource.includes("theme_color"));
    assert.ok(manifestSource.includes('purpose: "maskable"'));
  });

  // UI CORRECTION: a real iPhone showed the SVG icon set produced a generic
  // home-screen icon. Both platforms are given PNGs at the sizes they ask for.
  it("ships PNG icons at 192 and 512, not SVG", () => {
    assert.ok(manifestSource.includes("/icons/warehouse-mobile-192.png"));
    assert.ok(manifestSource.includes('sizes: "192x192"'));
    assert.ok(manifestSource.includes("/icons/warehouse-mobile-512.png"));
    assert.ok(manifestSource.includes('sizes: "512x512"'));
    assert.ok(manifestSource.includes('type: "image/png"'));
    assert.equal(manifestSource.includes("image/svg+xml"), false, "no SVG icon may remain");
  });

  it("ships a maskable PNG so Android does not letterbox the glyph", () => {
    assert.ok(manifestSource.includes("/icons/warehouse-mobile-maskable-512.png"));
  });

  it("every icon the manifest and layout reference exists on disk", () => {
    for (const file of [
      "warehouse-mobile-180.png",
      "warehouse-mobile-192.png",
      "warehouse-mobile-512.png",
      "warehouse-mobile-maskable-512.png",
    ]) {
      const bytes = readFileSync(join(process.cwd(), "public/icons", file));
      // PNG magic number — proves these are real rasters, not renamed SVGs.
      assert.deepEqual(
        [...bytes.subarray(0, 8)],
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        `${file} must be a real PNG`
      );
      // IHDR carries the true pixel dimensions.
      const expected = Number(file.match(/(\d+)\.png$/)![1]);
      assert.equal(bytes.readUInt32BE(16), expected, `${file} width`);
      assert.equal(bytes.readUInt32BE(20), expected, `${file} height`);
    }
  });

  it("the Apple touch icon is the 180x180 PNG", () => {
    assert.ok(layoutSource.includes("/icons/warehouse-mobile-180.png"));
    assert.ok(layoutSource.includes('sizes: "180x180"'));
    assert.equal(layoutSource.includes(".svg"), false, "iOS ignores an SVG apple-touch-icon");
  });

  it("adds no service worker and no PWA package", () => {
    for (const forbidden of ["serviceWorker", "workbox", "next-pwa", "serwist"]) {
      assert.equal(manifestSource.includes(forbidden), false);
    }
  });

  it("scopes the home-screen metadata to /mobile only", () => {
    assert.ok(layoutSource.includes("appleWebApp"));
    assert.ok(layoutSource.includes('manifest: "/manifest.webmanifest"'));
    assert.ok(layoutSource.includes("themeColor"));
  });
});
