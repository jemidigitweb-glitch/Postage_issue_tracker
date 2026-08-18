import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MOBILE_TIMELINE_KEY,
  hasRenderableEvidence,
  readMobileEvidence,
} from "../lib/access/mobileEvidence";
import {
  buildMobileTimelineExtraData,
  type VerifiedTimelineItem,
} from "../lib/mobile/mobileRegistration";
import { buildMobilePublicId } from "../lib/mobile/mobileAccess";

// Super Admin — Warehouse Mobile evidence, read for display.
//
// DISPLAY ONLY. Nothing here writes: no database, no Cloudinary, no Issue.
// The reader is fed the SAME extra_data shape Mobile Lite actually writes, so
// the two cannot drift apart without this failing.

/** Source with comment lines removed, so prose explaining what is NOT rendered
 *  cannot fail an assertion about what IS rendered. */
function stripComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*") &&
        !trimmed.startsWith("{/*")
      );
    })
    .join("\n");
}

const SUBMISSION = "0b6a3d2e-1c4f-4a7b-9e2d-8f5c1a3b7d90";
const ATTEMPT = "7c1e5a94-2b6d-4f83-9a10-3e8b2d6c4f57";

function photoItem(index: number, caption: string | null): VerifiedTimelineItem {
  const slot = `photo-${index}` as `photo-${number}`;
  return {
    id: crypto.randomUUID(),
    kind: "image",
    slot,
    caption,
    asset: {
      publicId: `issue-tracker/mobile/${SUBMISSION}/${slot}/${ATTEMPT}`,
      secureUrl: `https://res.cloudinary.com/demo/photo-${index}.jpg`,
      bytes: 1_500_000,
      format: "jpg",
      resourceType: "image",
    },
  };
}

function voiceItem(): VerifiedTimelineItem {
  return {
    id: crypto.randomUUID(),
    kind: "voice",
    slot: "voice",
    asset: {
      publicId: buildMobilePublicId(SUBMISSION, "voice", ATTEMPT),
      secureUrl: "https://res.cloudinary.com/demo/voice.webm",
      bytes: 400_000,
      format: "webm",
      resourceType: "video",
    },
  };
}

function textItem(text: string): VerifiedTimelineItem {
  return { id: crypto.randomUUID(), kind: "text", text };
}

/** extra_data exactly as Mobile Lite writes it. */
function storedExtraData(items: VerifiedTimelineItem[]) {
  return buildMobileTimelineExtraData(SUBMISSION, items);
}

describe("Mobile Evidence — reading what Mobile Lite actually stored", () => {
  it("renders a text entry as readable text, with no id and no JSON", () => {
    const items = readMobileEvidence(storedExtraData([textItem("test")]));
    assert.deepEqual(items, [{ kind: "text", text: "test" }]);

    const serialised = JSON.stringify(items);
    assert.equal(serialised.includes(SUBMISSION), false, "no submission id reaches the page");
    assert.equal(serialised.includes("public_id"), false);
    assert.equal(serialised.includes("issue-tracker/mobile"), false, "no Cloudinary path");
    assert.equal(/"id"/.test(serialised), false, "no internal item id");
    assert.equal(/"slot"/.test(serialised), false, "no slot metadata");
  });

  it("renders a photo with its own caption", () => {
    const items = readMobileEvidence(storedExtraData([photoItem(1, "Outer carton torn")]));
    assert.deepEqual(items, [
      {
        kind: "image",
        url: "https://res.cloudinary.com/demo/photo-1.jpg",
        caption: "Outer carton torn",
      },
    ]);
  });

  it("a photo with no caption carries null — never a placeholder", () => {
    const items = readMobileEvidence(storedExtraData([photoItem(1, null)]));
    assert.equal(items![0].kind, "image");
    assert.equal(items![0].kind === "image" ? items![0].caption : "not-null", null);
    const serialised = JSON.stringify(items);
    for (const placeholder of ["No caption", "N/A", "Caption:"]) {
      assert.equal(serialised.includes(placeholder), false, `must not invent "${placeholder}"`);
    }
  });

  it("renders a voice entry as a playable URL only", () => {
    const items = readMobileEvidence(storedExtraData([voiceItem()]));
    assert.deepEqual(items, [{ kind: "voice", url: "https://res.cloudinary.com/demo/voice.webm" }]);
  });

  it("preserves the stored order exactly, never regrouping by kind", () => {
    const stored = storedExtraData([
      textItem("Received damaged stock"),
      photoItem(1, "Outer carton torn"),
      photoItem(2, null),
      voiceItem(),
    ]);
    const items = readMobileEvidence(stored)!;
    assert.deepEqual(items.map((item) => item.kind), ["text", "image", "image", "voice"]);
    assert.equal(items[1].kind === "image" ? items[1].caption : null, "Outer carton torn");
    assert.equal(items[2].kind === "image" ? items[2].caption : "x", null);
  });
});

describe("Mobile Evidence — safety on anything unexpected", () => {
  it("returns null when there is no timeline at all", () => {
    for (const extraData of [
      {},
      { images: [], attachments: [] },
      { [MOBILE_TIMELINE_KEY]: [] },
      { [MOBILE_TIMELINE_KEY]: "not-an-array" },
      { [MOBILE_TIMELINE_KEY]: null },
      null,
      undefined,
      "string",
      [1, 2, 3],
    ]) {
      assert.equal(readMobileEvidence(extraData), null, `${JSON.stringify(extraData)} must be null`);
    }
  });

  it("a STAGE 1 Mobile Lite Issue is untouched — it has no timeline", () => {
    // The legacy writer emits images + attachments and no mobileTimeline.
    const legacy = {
      images: [{ url: "https://x/a.jpg", public_id: "p", original_name: "a.jpg" }],
      attachments: [{ type: "audio", url: "https://x/a.webm", source: "voice_recording" }],
      mobileSubmissionId: SUBMISSION,
      mobileSource: "warehouse-mobile-lite",
    };
    assert.equal(readMobileEvidence(legacy), null, "no Mobile Evidence section for Stage 1");
  });

  it("an unknown future entry kind becomes a neutral placeholder, never JSON", () => {
    const items = readMobileEvidence({
      [MOBILE_TIMELINE_KEY]: [
        { id: "x", kind: "hologram", payload: { secret: 1 } },
        { id: "y", kind: "text", text: "still fine" },
      ],
    })!;
    assert.deepEqual(items, [{ kind: "unsupported" }, { kind: "text", text: "still fine" }]);
    assert.equal(JSON.stringify(items).includes("hologram"), false);
    assert.equal(JSON.stringify(items).includes("secret"), false);
  });

  it("malformed entries never throw", () => {
    const malformed = [null, undefined, 7, "text", [], { kind: "text" }, { kind: "image" }, { kind: "voice" }];
    const items = readMobileEvidence({ [MOBILE_TIMELINE_KEY]: malformed })!;
    assert.equal(items.length, malformed.length);
    assert.ok(items.every((item) => item.kind === "unsupported"));
  });

  it("refuses a non-https media URL rather than rendering it", () => {
    const items = readMobileEvidence({
      [MOBILE_TIMELINE_KEY]: [
        { kind: "image", url: "http://insecure/a.jpg" },
        { kind: "image", url: "javascript:alert(1)" },
        { kind: "voice", url: "data:audio/webm;base64,AAAA" },
      ],
    })!;
    assert.ok(items.every((item) => item.kind === "unsupported"));
  });

  it("an all-unsupported timeline renders no section", () => {
    const items = readMobileEvidence({ [MOBILE_TIMELINE_KEY]: [{ kind: "???" }] });
    assert.equal(hasRenderableEvidence(items), false);
    assert.equal(hasRenderableEvidence(null), false);
    assert.equal(hasRenderableEvidence([{ kind: "text", text: "x" }]), true);
  });
});

describe("Mobile Evidence — the Super Admin page wiring", () => {
  const detailSource = readFileSync(join(process.cwd(), "components/issues/IssueDetail.tsx"), "utf8");
  const evidenceSource = readFileSync(
    join(process.cwd(), "components/issues/MobileEvidence.tsx"),
    "utf8"
  );
  /** The component with comments stripped — prose explaining what is NOT
   *  rendered must not fail an assertion about what IS rendered. */
  const evidenceCode = stripComments(evidenceSource);
  const adminPageSource = readFileSync(
    join(process.cwd(), "app/dashboard/issues/[issueId]/page.tsx"),
    "utf8"
  );

  it("is SUPER ADMIN only, and off by default", () => {
    assert.ok(detailSource.includes("showMobileEvidence = false"), "default is off");
    assert.ok(adminPageSource.includes('showMobileEvidence={view.kind === "admin"}'));
    // The Assignee portal renders IssueDetail without the prop, so its markup
    // is unchanged. No other caller passes it.
    assert.equal((adminPageSource.match(/showMobileEvidence=/g) ?? []).length, 1);
  });

  it("the raw timeline no longer reaches the generic JSON dump", () => {
    assert.ok(detailSource.includes("key.toLowerCase() === MOBILE_TIMELINE_KEY.toLowerCase()"));
    // …and only while the readable section is actually rendering.
    assert.ok(detailSource.includes("showsMobileEvidence && key.toLowerCase()"));
  });

  it("the same media is not printed twice", () => {
    assert.ok(detailSource.includes("{!showsMobileEvidence && images.length > 0 && ("));
    assert.ok(detailSource.includes("{!showsMobileEvidence && ("), "audio block is suppressed too");
  });

  it("the section shows friendly labels and no internals", () => {
    assert.ok(evidenceSource.includes("Mobile Evidence"));
    assert.ok(evidenceSource.includes("📝"));
    assert.ok(evidenceSource.includes("🖼️"));
    assert.ok(evidenceSource.includes("🎤"));
    assert.ok(evidenceSource.includes("Caption: {item.caption}"));
    assert.ok(evidenceSource.includes("{item.caption && ("), "no caption line without a caption");
    assert.ok(evidenceSource.includes("<audio"));
    assert.ok(evidenceSource.includes("Unsupported evidence item"));
    for (const internal of ["JSON.stringify", "public_id", "submissionId", "item.id", "slot"]) {
      assert.equal(evidenceCode.includes(internal), false, `must not render ${internal}`);
    }
  });

  it("writes nothing and adds no control", () => {
    for (const forbidden of ["use client", "action=", "onClick", "useState", "fetch(", "lib/db"]) {
      assert.equal(evidenceCode.includes(forbidden), false, `display only — no ${forbidden}`);
    }
  });

  it("the reader stays pure — no server, database or network import", () => {
    const readerCode = stripComments(
      readFileSync(join(process.cwd(), "lib/access/mobileEvidence.ts"), "utf8")
    );
    for (const forbidden of ["server-only", "next/", "lib/db", "cloudinary"]) {
      assert.equal(readerCode.includes(forbidden), false, `must not import ${forbidden}`);
    }
  });
});
