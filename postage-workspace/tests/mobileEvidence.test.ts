import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MOBILE_SOURCE_KEY,
  MOBILE_SOURCE_VALUE,
  MOBILE_TIMELINE_KEY,
  hasRenderableEvidence,
  isWarehouseMobileLite,
  readMobileEvidence,
} from "../lib/access/mobileEvidence";
import {
  MOBILE_SOURCE_KEY as WRITER_SOURCE_KEY,
  MOBILE_SOURCE_VALUE as WRITER_SOURCE_VALUE,
  MOBILE_SUBMISSION_KEY,
  MOBILE_TIMELINE_KEY as WRITER_TIMELINE_KEY,
  buildMobileTimelineExtraData,
  type VerifiedTimelineItem,
} from "../lib/mobile/mobileRegistration";
import { buildMobilePublicId } from "../lib/mobile/mobileAccess";
import { resolveIssueDetailView } from "../lib/access/issueDetailView";

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

/** One recording. `index` picks its slot, because a report may carry several
 *  and no two of them may share a Cloudinary path. */
function voiceItem(index = 1): VerifiedTimelineItem {
  const slot = `voice-${index}` as `voice-${number}`;
  return {
    id: crypto.randomUUID(),
    kind: "voice",
    slot,
    asset: {
      publicId: buildMobilePublicId(SUBMISSION, slot, ATTEMPT),
      secureUrl: `https://res.cloudinary.com/demo/${slot}.webm`,
      bytes: 400_000,
      format: "webm",
      resourceType: "video",
    },
  };
}

/** A STAGE 1 / STAGE 2 recording, in the single legacy "voice" slot. */
function legacyVoiceItem(): VerifiedTimelineItem {
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

/**
 * A hand-built extra_data carrying the Mobile Lite marker plus a raw timeline.
 *
 * The marker is what identifies the Issue (see the reader's header), so a
 * fixture that omitted it would be testing a shape Mobile Lite never writes.
 */
function markedTimeline(entries: unknown[]) {
  return { [MOBILE_SOURCE_KEY]: MOBILE_SOURCE_VALUE, [MOBILE_TIMELINE_KEY]: entries };
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

  it("renders a voice entry as a numbered, playable URL only", () => {
    const items = readMobileEvidence(storedExtraData([voiceItem()]));
    assert.deepEqual(items, [
      { kind: "voice", url: "https://res.cloudinary.com/demo/voice-1.webm", number: 1 },
    ]);
  });

  it("a LEGACY single-slot recording still renders", () => {
    const items = readMobileEvidence(storedExtraData([legacyVoiceItem()]));
    assert.deepEqual(items, [
      { kind: "voice", url: "https://res.cloudinary.com/demo/voice.webm", number: 1 },
    ]);
  });

  it("renders SEVERAL recordings, numbered in the order they were made", () => {
    const stored = storedExtraData([voiceItem(1), voiceItem(2), voiceItem(3)]);
    assert.deepEqual(readMobileEvidence(stored), [
      { kind: "voice", url: "https://res.cloudinary.com/demo/voice-1.webm", number: 1 },
      { kind: "voice", url: "https://res.cloudinary.com/demo/voice-2.webm", number: 2 },
      { kind: "voice", url: "https://res.cloudinary.com/demo/voice-3.webm", number: 3 },
    ]);
  });

  it("numbers recordings among THEMSELVES, not among all entries", () => {
    // 1 text, 2 photos, 3 voices — the shape the owner described.
    const stored = storedExtraData([
      textItem("Pallet crushed"),
      photoItem(1, "Front"),
      voiceItem(1),
      photoItem(2, null),
      voiceItem(2),
      voiceItem(3),
    ]);
    const items = readMobileEvidence(stored)!;
    assert.deepEqual(
      items.map((item) => item.kind),
      ["text", "image", "voice", "image", "voice", "voice"],
      "the stored order is preserved, interleaving and all"
    );
    assert.deepEqual(
      items.flatMap((item) => (item.kind === "voice" ? [item.number] : [])),
      [1, 2, 3],
      "Voice Note 1, 2, 3 — however they are interleaved"
    );
  });

  it("all five recordings render", () => {
    const stored = storedExtraData([1, 2, 3, 4, 5].map((index) => voiceItem(index)));
    const items = readMobileEvidence(stored)!;
    assert.equal(items.length, 5);
    assert.deepEqual(
      items.flatMap((item) => (item.kind === "voice" ? [item.number] : [])),
      [1, 2, 3, 4, 5]
    );
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

// ---------------------------------------------------------------------------
// Detection — by metadata, and by nothing else
// ---------------------------------------------------------------------------

describe("Mobile Evidence — a Mobile Lite Issue is recognised by its metadata", () => {
  it("the reader's marker is exactly the one the writer stamps", () => {
    assert.equal(MOBILE_SOURCE_KEY, WRITER_SOURCE_KEY);
    assert.equal(MOBILE_SOURCE_VALUE, WRITER_SOURCE_VALUE);
    assert.equal(MOBILE_TIMELINE_KEY, WRITER_TIMELINE_KEY);
    assert.equal(MOBILE_SOURCE_VALUE, "warehouse-mobile-lite");
    // And a real registration really does carry it.
    const stored = storedExtraData([textItem("test")]);
    assert.equal(stored[MOBILE_SOURCE_KEY], MOBILE_SOURCE_VALUE);
    assert.equal(isWarehouseMobileLite(stored), true);
  });

  it("TU-001 — a Mobile Lite Issue raised by a NON-WH staff member is recognised", () => {
    // The bug: TU-001 came from Warehouse Mobile Lite but was raised by
    // TestUser, so anything keyed on "WH" called it a desktop Issue and dumped
    // its timeline as JSON. Nothing about the raiser is in extra_data, and
    // nothing about the raiser is consulted.
    const stored = storedExtraData([textItem("Testing issue"), voiceItem(1), voiceItem(2)]);
    const items = readMobileEvidence(stored)!;
    assert.equal(hasRenderableEvidence(items), true);
    assert.deepEqual(items.map((item) => item.kind), ["text", "voice", "voice"]);

    // The detection input contains no staff code, no Issue ID and no name.
    const serialised = JSON.stringify(stored);
    for (const raiserish of ["TU-", "WH-", "TestUser", "Warehouse Mobile\"", "staff_code"]) {
      assert.equal(serialised.includes(raiserish), false, `detection must not depend on ${raiserish}`);
    }
  });

  it("a desktop Issue is NOT mistaken for a Mobile Lite one", () => {
    for (const extraData of [
      {},
      { images: [], attachments: [] },
      { member: "Someone", dataLink: "https://x" },
      // A timeline WITHOUT the marker is not a Mobile Lite Issue.
      { [MOBILE_TIMELINE_KEY]: [{ id: "a", kind: "text", text: "hi" }] },
      // A near-miss marker is not the marker.
      { [MOBILE_SOURCE_KEY]: "warehouse-mobile", [MOBILE_TIMELINE_KEY]: [] },
      { [MOBILE_SOURCE_KEY]: "Warehouse-Mobile-Lite" },
      { [MOBILE_SOURCE_KEY]: true },
      null,
      undefined,
      "string",
      [1, 2, 3],
    ]) {
      assert.equal(isWarehouseMobileLite(extraData), false, `${JSON.stringify(extraData)}`);
      assert.equal(readMobileEvidence(extraData), null);
    }
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
    const items = readMobileEvidence(
      markedTimeline([
        { id: "x", kind: "hologram", payload: { secret: 1 } },
        { id: "y", kind: "text", text: "still fine" },
      ])
    )!;
    assert.deepEqual(items, [{ kind: "unsupported" }, { kind: "text", text: "still fine" }]);
    assert.equal(JSON.stringify(items).includes("hologram"), false);
    assert.equal(JSON.stringify(items).includes("secret"), false);
  });

  it("malformed entries never throw", () => {
    const malformed = [null, undefined, 7, "text", [], { kind: "text" }, { kind: "image" }, { kind: "voice" }];
    const items = readMobileEvidence(markedTimeline(malformed))!;
    assert.equal(items.length, malformed.length);
    assert.ok(items.every((item) => item.kind === "unsupported"));
  });

  it("refuses a non-https media URL rather than rendering it", () => {
    const items = readMobileEvidence(
      markedTimeline([
        { kind: "image", url: "http://insecure/a.jpg" },
        { kind: "image", url: "javascript:alert(1)" },
        { kind: "voice", url: "data:audio/webm;base64,AAAA" },
      ])
    )!;
    assert.ok(items.every((item) => item.kind === "unsupported"));
  });

  it("a refused recording does not consume a Voice Note number", () => {
    const items = readMobileEvidence(
      markedTimeline([
        { kind: "voice", url: "http://insecure/a.webm" },
        { kind: "voice", url: "https://res.cloudinary.com/demo/real.webm" },
      ])
    )!;
    assert.deepEqual(items, [
      { kind: "unsupported" },
      { kind: "voice", url: "https://res.cloudinary.com/demo/real.webm", number: 1 },
    ]);
  });

  it("an all-unsupported timeline renders no section", () => {
    const items = readMobileEvidence(markedTimeline([{ kind: "???" }]));
    assert.equal(hasRenderableEvidence(items), false);
    assert.equal(hasRenderableEvidence(null), false);
    assert.equal(hasRenderableEvidence([{ kind: "text", text: "x" }]), true);
  });
});

describe("Mobile Evidence — the Issue detail page wiring", () => {
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

  it("is off by default, and decided by ONE resolved flag", () => {
    assert.ok(detailSource.includes("showMobileEvidence = false"), "default is off");
    assert.ok(adminPageSource.includes("showMobileEvidence={view.showMobileEvidence}"));
    // Superseded: the page used to hard-code `view.kind === "admin"` here,
    // which is what left Raised-by-Staff looking at raw JSON on TU-001.
    assert.equal(adminPageSource.includes('view.kind === "admin"}\n'), false);
    assert.equal((adminPageSource.match(/showMobileEvidence=/g) ?? []).length, 1);
  });

  it("Super Admin and Raised-by-Staff get it; the Assignee portal does not", () => {
    const admin = resolveIssueDetailView({
      canChangeStatusAny: true,
      canChangeStatusOwnAssigned: false,
    });
    const assignee = resolveIssueDetailView({
      canChangeStatusAny: false,
      canChangeStatusOwnAssigned: true,
    });
    // `raised_by` holds neither status permission, so it resolves to "other".
    const raisedBy = resolveIssueDetailView({
      canChangeStatusAny: false,
      canChangeStatusOwnAssigned: false,
    });

    assert.equal(admin.showMobileEvidence, true);
    assert.equal(raisedBy.showMobileEvidence, true);
    assert.equal(assignee.showMobileEvidence, false, "the Assignee portal is untouched");

    // And nothing else about the Assignee portal moved with it.
    assert.equal(assignee.showWorkProgress, true);
    assert.equal(assignee.showAssigneeStatusControl, true);
    assert.equal(assignee.showAssignedTo, true);
    assert.equal(assignee.showFixAndActionRequired, true);
    assert.equal(assignee.showAiAssistant, true);
  });

  it("the internal submission id is not printed, but is still stored", () => {
    // Display only. The UUID stays in extra_data — it is what makes one
    // REGISTER press create exactly one Issue — it is just not shown.
    assert.ok(detailSource.includes('"mobilesubmissionid"'), "filtered from display");
    const stored = storedExtraData([textItem("test")]);
    assert.equal(stored[MOBILE_SUBMISSION_KEY], SUBMISSION, "still written, unchanged");
    // Mobile Source is deliberately NOT hidden — where an Issue came from is
    // worth showing; an internal id is not.
    assert.equal(detailSource.includes('"mobilesource"'), false);
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
    // Numbered, so several recordings are told apart.
    assert.ok(evidenceCode.includes("Voice Note {item.number}"));
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
