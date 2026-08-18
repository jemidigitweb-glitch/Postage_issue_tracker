import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildMobilePublicId,
  buildMobileUploadTicket,
  isMobileUploadSlot,
  isValidSubmissionId,
  MOBILE_UPLOAD_FOLDER,
  MOBILE_UPLOAD_SLOTS,
  resourceTypeForSlot,
} from "../lib/mobile/mobileAccess";
import { permissionsForRole, roleHasPermission, type Permission } from "../lib/access/permissions";

// Warehouse Mobile Lite — upload rules, and proof that the corrected design
// adds NOTHING to the Issue Tracker's permission model.
//
// Everything here is pure: no Cloudinary account, no database, no session, no
// browser.

const VALID_UUID = "0b6a3d2e-1c4f-4a7b-9e2d-8f5c1a3b7d90";
const ATTEMPT = "7c1e5a94-2b6d-4f83-9a10-3e8b2d6c4f57";

describe("Mobile Lite upload slots", () => {
  it("supports exactly voice, photo1 and photo2", () => {
    assert.deepEqual([...MOBILE_UPLOAD_SLOTS], ["voice", "photo1", "photo2"]);
  });

  it("rejects any other slot", () => {
    for (const slot of ["photo3", "video", "", "VOICE", "../voice", "voice ", 1, null, undefined]) {
      assert.equal(isMobileUploadSlot(slot), false, `${String(slot)} must not be a valid slot`);
    }
  });

  it("maps photos to the image resource type and voice to video", () => {
    // Mirrors the desktop mapping in lib/cloudinary.ts: Cloudinary stores
    // audio under the video resource type.
    assert.equal(resourceTypeForSlot("photo1"), "image");
    assert.equal(resourceTypeForSlot("photo2"), "image");
    assert.equal(resourceTypeForSlot("voice"), "video");
  });
});

describe("Mobile Lite submission ids", () => {
  it("accepts a crypto.randomUUID() value", () => {
    assert.equal(isValidSubmissionId(VALID_UUID), true);
    assert.equal(isValidSubmissionId(crypto.randomUUID()), true);
  });

  it("rejects anything that is not a UUID", () => {
    for (const value of [
      "",
      "not-a-uuid",
      "0b6a3d2e1c4f4a7b9e2d8f5c1a3b7d90",
      `${VALID_UUID}/../other`,
      `${VALID_UUID} `,
      42,
      null,
      undefined,
      {},
    ]) {
      assert.equal(isValidSubmissionId(value), false, `${String(value)} must be rejected`);
    }
  });
});

describe("Mobile Lite public_id — the security boundary", () => {
  it("is composed by the server from the submission id and slot", () => {
    assert.equal(
      buildMobilePublicId(VALID_UUID, "photo1", ATTEMPT),
      `${MOBILE_UPLOAD_FOLDER}/${VALID_UUID}/photo1/${ATTEMPT}`
    );
  });

  it("uses a folder separate from the desktop intake folder", () => {
    assert.equal(MOBILE_UPLOAD_FOLDER, "issue-tracker/mobile");
    assert.ok(!MOBILE_UPLOAD_FOLDER.includes("intake"));
  });

  it("throws rather than signing anything for an invalid submission id", () => {
    assert.throws(() => buildMobilePublicId("not-a-uuid", "voice", ATTEMPT), /Invalid submission id/);
    assert.throws(() => buildMobilePublicId("", "voice", ATTEMPT), /Invalid submission id/);
  });

  it("throws rather than signing anything for an invalid slot", () => {
    // @ts-expect-error — proving a bad slot cannot reach a signature.
    assert.throws(() => buildMobilePublicId(VALID_UUID, "photo3", ATTEMPT), /Invalid upload slot/);
  });

  it("cannot be escaped by a traversal attempt in either component", () => {
    assert.throws(() => buildMobilePublicId("../../etc/passwd", "voice", ATTEMPT), /Invalid submission id/);
    // @ts-expect-error — a traversal slot is not a slot.
    assert.throws(() => buildMobilePublicId(VALID_UUID, "../voice", ATTEMPT), /Invalid upload slot/);
  });

  it("gives each slot of a submission its own distinct path", () => {
    const paths = MOBILE_UPLOAD_SLOTS.map((slot) => buildMobilePublicId(VALID_UUID, slot, ATTEMPT));
    assert.equal(new Set(paths).size, 3);
  });
});

describe("Mobile Lite upload ticket — nothing secret may reach the browser", () => {
  const ticket = buildMobileUploadTicket({
    cloudName: "example-cloud",
    apiKey: "123456789",
    timestamp: 1_760_000_000,
    signature: "a".repeat(40),
    publicId: buildMobilePublicId(VALID_UUID, "voice", ATTEMPT),
    resourceType: "video",
  });

  it("carries exactly the six fields a direct upload needs", () => {
    assert.deepEqual(Object.keys(ticket).sort(), [
      "apiKey",
      "cloudName",
      "publicId",
      "resourceType",
      "signature",
      "timestamp",
    ]);
  });

  it("contains no api secret under any spelling", () => {
    const serialized = JSON.stringify(ticket).toLowerCase();
    for (const forbidden of ["secret", "api_secret", "apisecret", "password", "database"]) {
      assert.equal(serialized.includes(forbidden), false, `ticket must not contain "${forbidden}"`);
    }
  });

  it("does not copy unexpected fields from its input", () => {
    const widened = buildMobileUploadTicket({
      cloudName: "c",
      apiKey: "k",
      timestamp: 1,
      signature: "s",
      publicId: "p",
      resourceType: "image",
      // @ts-expect-error — a caller must not be able to widen the response.
      apiSecret: "must-not-appear",
    });
    assert.equal(Object.keys(widened).includes("apiSecret"), false);
    assert.equal(JSON.stringify(widened).includes("must-not-appear"), false);
  });
});

describe("Mobile Lite requires a signed-in submitter (Raised-by-Staff)", () => {
  // THREE designs have existed here, and this block has been rewritten each
  // time rather than left asserting a superseded rule:
  //   1. An "issue:create_mobile" permission plus a username allowlist.
  //   2. No permission at all — /mobile open to any browser, bound only by an
  //      anonymous `wh_mobile` cookie. This block previously asserted that NO
  //      mobile permission existed anywhere in the matrix.
  //   3. CURRENT: one narrow key, `mobile:submit`, held by the shared
  //      `raised_by` login and by `admin`.
  //
  // The superseded names must stay gone; the current key must stay narrow.

  const everyPermission: Permission[] = [
    ...permissionsForRole("admin"),
    ...permissionsForRole("staff"),
    ...permissionsForRole("management"),
    ...permissionsForRole("raised_by"),
  ];

  it("exactly one mobile permission exists in the whole matrix", () => {
    const mobileKeys = [...new Set(everyPermission.filter((p) => p.includes("mobile")))];
    assert.deepEqual(mobileKeys, ["mobile:submit"]);
  });

  it("the superseded allowlist permission is still gone", () => {
    assert.equal(
      // Compared as plain strings: the key no longer exists in the Permission
      // union, which is the point of the assertion.
      (everyPermission as string[]).some((permission) => permission === "issue:create_mobile"),
      false
    );
  });

  it("only raised_by and admin may submit from a phone", () => {
    assert.equal(roleHasPermission("raised_by", "mobile:submit"), true);
    assert.equal(roleHasPermission("admin", "mobile:submit"), true);
    assert.equal(roleHasPermission("staff", "mobile:submit"), false);
    assert.equal(roleHasPermission("management", "mobile:submit"), false);
    assert.equal(roleHasPermission(null, "mobile:submit"), false);
  });

  it("the Assignee role is unchanged — Mobile Lite gave it nothing", () => {
    assert.deepEqual([...permissionsForRole("staff")].sort(), [
      "issue:analyse_own_assigned",
      "issue:change_status_own_assigned",
      "issue:view_own_assigned",
    ]);
  });

  it("desktop issue:create — admin, management, and now the raiser", () => {
    assert.equal(roleHasPermission("admin", "issue:create"), true);
    assert.equal(roleHasPermission("management", "issue:create"), true);
    // Raised-by-Staff files Issues from the web as well as from a phone. The
    // raiser recorded on the Issue is still not theirs to choose — the server
    // derives it from their linked issue_staff row.
    assert.equal(roleHasPermission("raised_by", "issue:create"), true);
    // The Assignee still cannot create anything.
    assert.equal(roleHasPermission("staff", "issue:create"), false);
    assert.equal(roleHasPermission(null, "issue:create"), false);
  });

  it("mobile:submit is the ONLY thing added to the Super Admin set", () => {
    // Nineteen before this feature; twenty now, and the twentieth is named.
    assert.equal(permissionsForRole("admin").size, 20);
    assert.equal(permissionsForRole("admin").has("mobile:submit"), true);
  });
});
