import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MOBILE_CAPTION_PREFIX,
  MOBILE_FALLBACK_DESCRIPTION,
  MOBILE_MAX_CAPTION_LENGTH,
  MOBILE_MAX_TEXT_LENGTH,
  MOBILE_MAX_TIMELINE_ITEMS,
  MOBILE_MAX_VOICE_ITEMS,
  MOBILE_SOURCE_KEY,
  MOBILE_SOURCE_VALUE,
  MOBILE_SUBMISSION_KEY,
  MOBILE_TIMELINE_KEY,
  buildMobileDescription,
  buildMobileTimelineExtraData,
  normaliseMobileCaption,
  normaliseMobileText,
  verifyMobileTimeline,
  type MobileTimelineInput,
  type SubmittedAsset,
  type VerifiedTimelineItem,
} from "../lib/mobile/mobileRegistration";
import {
  MOBILE_MAX_PHOTOS,
  MOBILE_MAX_VOICES,
  buildMobilePublicId,
  isMobilePhotoSlot,
  isMobileUploadSlot,
  mobilePhotoSlot,
  mobileVoiceSlot,
  resourceTypeForSlot,
} from "../lib/mobile/mobileAccess";
import { readAudioAttachments, ASSIGNEE_VISIBLE_SOURCES } from "../lib/access/attachments";

// Warehouse Mobile Lite — STAGE 2: the ordered registration contract.
//
// Pure: no database, no Cloudinary, no session. NOTHING here writes to
// PostgreSQL, and no Issue, staff row or asset is created.

const SUBMISSION = "0b6a3d2e-1c4f-4a7b-9e2d-8f5c1a3b7d90";
const OTHER_SUBMISSION = "11111111-2222-4333-8444-555555555555";
const ATTEMPT = "7c1e5a94-2b6d-4f83-9a10-3e8b2d6c4f57";

function photoAsset(slot: string, over: Partial<SubmittedAsset> = {}): SubmittedAsset {
  return {
    publicId: `issue-tracker/mobile/${SUBMISSION}/${slot}/${ATTEMPT}`,
    secureUrl: "https://res.cloudinary.com/demo/a.jpg",
    bytes: 1_500_000,
    format: "jpg",
    resourceType: "image",
    ...over,
  };
}

function voiceAsset(over: Partial<SubmittedAsset> = {}, slot = "voice"): SubmittedAsset {
  return {
    publicId: buildMobilePublicId(SUBMISSION, slot as "voice", ATTEMPT),
    secureUrl: `https://res.cloudinary.com/demo/${slot}.webm`,
    bytes: 400_000,
    format: "webm",
    resourceType: "video",
    ...over,
  };
}

/** One recording in the numbered Stage 3 namespace: voice-1 … voice-5. */
function numberedVoiceInput(index: number): MobileTimelineInput {
  const slot = mobileVoiceSlot(index);
  return { id: `v${index}`, kind: "voice", slot, asset: voiceAsset({}, slot) };
}

function textItem(id: string, text: string): MobileTimelineInput {
  return { id, kind: "text", text };
}

function imageItem(id: string, index: number, caption?: string): MobileTimelineInput {
  const slot = mobilePhotoSlot(index);
  return { id, kind: "image", slot, asset: photoAsset(slot), caption };
}

function voiceInput(id: string): MobileTimelineInput {
  return { id, kind: "voice", slot: "voice", asset: voiceAsset() };
}

function verified(items: MobileTimelineInput[]): VerifiedTimelineItem[] {
  const result = verifyMobileTimeline(SUBMISSION, items);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result.ok ? result.items : [];
}

// ---------------------------------------------------------------------------

describe("Stage 2 slots — dynamic, validated, and backward compatible", () => {
  it("accepts photo-1 through photo-10", () => {
    for (let index = 1; index <= MOBILE_MAX_PHOTOS; index++) {
      const slot = mobilePhotoSlot(index);
      assert.equal(isMobilePhotoSlot(slot), true, `${slot} must be valid`);
      assert.equal(isMobileUploadSlot(slot), true);
      assert.equal(resourceTypeForSlot(slot), "image");
    }
  });

  it("rejects photo-11 and every near miss", () => {
    for (const slot of [
      "photo-11",
      "photo-0",
      "photo-01",
      "photo-1a",
      "photo-",
      "photo3",
      "photo-1/../voice",
      "PHOTO-1",
      "voice-2",
      "",
      " photo-1",
      1,
      null,
      undefined,
      {},
    ]) {
      assert.equal(isMobilePhotoSlot(slot), false, `${String(slot)} must not be a photo slot`);
    }
    assert.equal(isMobileUploadSlot("photo-11"), false);
    assert.equal(isMobileUploadSlot("anything"), false);
  });

  it("refuses to compose a slot outside the range", () => {
    for (const index of [0, 11, -1, 1.5, NaN]) {
      assert.throws(() => mobilePhotoSlot(index), /Invalid photo index/);
    }
  });

  it("STAGE 1 slots remain valid — no migration, no broken history", () => {
    for (const slot of ["voice", "photo1", "photo2"]) {
      assert.equal(isMobileUploadSlot(slot), true, `${slot} must stay valid`);
    }
    assert.equal(resourceTypeForSlot("photo1"), "image");
    assert.equal(resourceTypeForSlot("voice"), "video");
    // The public_id boundary is unchanged in both stages.
    assert.equal(
      buildMobilePublicId(SUBMISSION, "photo-7", ATTEMPT),
      `issue-tracker/mobile/${SUBMISSION}/photo-7/${ATTEMPT}`
    );
  });
});

describe("Stage 2 — flexible registration readiness, enforced on the server", () => {
  it("a text-only report is valid", () => {
    const items = verified([textItem("t1", "Conveyor belt jammed")]);
    assert.deepEqual(items.map((item) => item.kind), ["text"]);
  });

  it("an image-only report is valid", () => {
    assert.equal(verifyMobileTimeline(SUBMISSION, [imageItem("p1", 1)]).ok, true);
  });

  it("a voice-only report is valid", () => {
    assert.equal(verifyMobileTimeline(SUBMISSION, [voiceInput("v1")]).ok, true);
  });

  it("the Stage 1 combination is still valid", () => {
    const legacy: MobileTimelineInput[] = [
      { id: "v1", kind: "voice", slot: "voice", asset: voiceAsset() },
      { id: "p1", kind: "image", slot: "photo1", asset: photoAsset("photo1") },
      { id: "p2", kind: "image", slot: "photo2", asset: photoAsset("photo2") },
    ];
    assert.equal(verifyMobileTimeline(SUBMISSION, legacy).ok, true);
  });

  it("an EMPTY report is rejected", () => {
    for (const empty of [[], null, undefined, "", {}]) {
      const result = verifyMobileTimeline(SUBMISSION, empty);
      assert.equal(result.ok, false, `${JSON.stringify(empty)} must be rejected`);
    }
  });

  it("a whitespace-only message is rejected — it is not a meaningful item", () => {
    const result = verifyMobileTimeline(SUBMISSION, [textItem("t1", "   \n  ")]);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /cannot be empty/);
  });

  it("an invalid submission id rejects everything", () => {
    assert.equal(verifyMobileTimeline("not-a-uuid", [textItem("t1", "hello")]).ok, false);
  });
});

describe("Stage 2 — caps and duplicates", () => {
  it("accepts exactly ten photos and rejects the eleventh", () => {
    const ten = Array.from({ length: 10 }, (_, i) => imageItem(`p${i + 1}`, i + 1));
    assert.equal(verifyMobileTimeline(SUBMISSION, ten).ok, true);

    // An eleventh cannot even be named: photo-11 is not a slot.
    const eleventh: MobileTimelineInput = {
      id: "p11",
      kind: "image",
      slot: "photo-11",
      asset: photoAsset("photo-11"),
    };
    const result = verifyMobileTimeline(SUBMISSION, [...ten, eleventh]);
    assert.equal(result.ok, false);
  });

  it("enforces the photo cap even against legacy slot names", () => {
    const ten = Array.from({ length: 10 }, (_, i) => imageItem(`p${i + 1}`, i + 1));
    const legacyExtra: MobileTimelineInput = {
      id: "p11",
      kind: "image",
      slot: "photo1",
      asset: photoAsset("photo1"),
    };
    const result = verifyMobileTimeline(SUBMISSION, [...ten, legacyExtra]);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /at most 10 photos/);
  });

  it("allows at most FIVE voice recordings", () => {
    // SUPERSEDED: this cap was 1, and a second recording replaced the first.
    assert.equal(MOBILE_MAX_VOICE_ITEMS, 5);
    assert.equal(MOBILE_MAX_VOICE_ITEMS, MOBILE_MAX_VOICES, "one number, not two");

    // Two coexist.
    const two = verifyMobileTimeline(SUBMISSION, [
      numberedVoiceInput(1),
      numberedVoiceInput(2),
    ]);
    assert.equal(two.ok, true, two.ok ? "" : two.error);
    assert.equal(two.ok && two.items.length, 2);

    // Exactly five are accepted...
    const five = [1, 2, 3, 4, 5].map(numberedVoiceInput);
    const fiveResult = verifyMobileTimeline(SUBMISSION, five);
    assert.equal(fiveResult.ok, true, fiveResult.ok ? "" : fiveResult.error);
    assert.equal(fiveResult.ok && fiveResult.items.filter((i) => i.kind === "voice").length, 5);
  });

  it("THE SERVER refuses a sixth recording, whatever the client did", () => {
    const six = [...[1, 2, 3, 4, 5].map(numberedVoiceInput), numberedVoiceInput(6)];
    const result = verifyMobileTimeline(SUBMISSION, six);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /at most 5 voice recordings/);
  });

  it("enforces the voice cap even against the legacy slot name", () => {
    // A client that mixed voice-1…voice-5 with the Stage 1 "voice" slot would
    // be at six recordings, and is refused on the count, not on the naming.
    const six: MobileTimelineInput[] = [
      ...[1, 2, 3, 4, 5].map(numberedVoiceInput),
      { id: "legacy", kind: "voice", slot: "voice", asset: voiceAsset() },
    ];
    const result = verifyMobileTimeline(SUBMISSION, six);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /at most 5 voice recordings/);
  });

  it("keeps every recording in the order it was submitted", () => {
    const result = verifyMobileTimeline(SUBMISSION, [
      textItem("t", "Pallet crushed"),
      numberedVoiceInput(1),
      imageItem("p1", 1),
      numberedVoiceInput(2),
      numberedVoiceInput(3),
    ]);
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    assert.deepEqual(
      result.ok ? result.items.map((item) => item.kind) : [],
      ["text", "voice", "image", "voice", "voice"]
    );
    assert.deepEqual(
      result.ok
        ? result.items.flatMap((item) => (item.kind === "voice" ? [item.slot] : []))
        : [],
      ["voice-1", "voice-2", "voice-3"],
      "order preserved"
    );
  });

  it("a voice item may not sit in a photo slot, and vice versa", () => {
    const voiceInPhotoSlot: MobileTimelineInput = {
      id: "x",
      kind: "voice",
      slot: "photo-1",
      asset: voiceAsset({}, "photo-1"),
    };
    assert.equal(verifyMobileTimeline(SUBMISSION, [voiceInPhotoSlot]).ok, false);

    const photoInVoiceSlot: MobileTimelineInput = {
      id: "y",
      kind: "image",
      slot: "voice-1",
      asset: photoAsset("voice-1"),
    };
    assert.equal(verifyMobileTimeline(SUBMISSION, [photoInVoiceSlot]).ok, false);
  });

  it("stores several recordings as ordered, numbered audio attachments", () => {
    const items = verified([numberedVoiceInput(1), numberedVoiceInput(2), numberedVoiceInput(3)]);
    const extraData = buildMobileTimelineExtraData(SUBMISSION, items);

    const timeline = extraData[MOBILE_TIMELINE_KEY] as Array<Record<string, unknown>>;
    assert.deepEqual(timeline.map((entry) => entry.slot), ["voice-1", "voice-2", "voice-3"]);

    // The existing audio reader sees all three, still playable in both portals
    // (voice_recording is inside ASSIGNEE_VISIBLE_SOURCES).
    const audio = readAudioAttachments(extraData.attachments, ASSIGNEE_VISIBLE_SOURCES);
    assert.equal(audio.length, 3);
    assert.deepEqual(
      audio.map((entry) => entry.original_name),
      ["voice-recording-1", "voice-recording-2", "voice-recording-3"],
      "each recording is named for its position, not all called the same thing"
    );
    for (const entry of audio) {
      assert.equal(entry.source, "voice_recording");
      assert.ok(entry.url.startsWith("https://"));
    }
  });

  it("rejects two items claiming the same slot", () => {
    const result = verifyMobileTimeline(SUBMISSION, [imageItem("p1", 1), imageItem("p2", 1)]);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /duplicate/);
  });

  it("rejects two items carrying the SAME Cloudinary asset", () => {
    const shared = photoAsset(mobilePhotoSlot(1));
    const items: MobileTimelineInput[] = [
      { id: "p1", kind: "image", slot: "photo-1", asset: shared },
      { id: "p2", kind: "image", slot: "photo-2", asset: shared },
    ];
    assert.equal(verifyMobileTimeline(SUBMISSION, items).ok, false);
  });

  it("rejects duplicate item ids", () => {
    const result = verifyMobileTimeline(SUBMISSION, [textItem("same", "a"), textItem("same", "b")]);
    assert.equal(result.ok, false);
  });

  it("rejects a malformed item id", () => {
    for (const id of ["", "../x", "a b", "x".repeat(65), 7, null, undefined]) {
      const result = verifyMobileTimeline(SUBMISSION, [
        { id, kind: "text", text: "hello" } as unknown as MobileTimelineInput,
      ]);
      assert.equal(result.ok, false, `${String(id)} must be rejected`);
    }
  });

  it("rejects an unsupported item kind", () => {
    for (const kind of ["file", "document", "location", "sticker", "", null]) {
      const result = verifyMobileTimeline(SUBMISSION, [
        { id: "x1", kind, text: "hello" } as unknown as MobileTimelineInput,
      ]);
      assert.equal(result.ok, false, `${String(kind)} must be rejected`);
    }
  });

  it("rejects a non-object item", () => {
    for (const junk of ["text", 7, null, ["nested"]]) {
      assert.equal(
        verifyMobileTimeline(SUBMISSION, [junk as unknown as MobileTimelineInput]).ok,
        false
      );
    }
  });

  it("bounds the total number of items", () => {
    const many = Array.from({ length: MOBILE_MAX_TIMELINE_ITEMS + 1 }, (_, i) =>
      textItem(`t${i}`, `note ${i}`)
    );
    assert.equal(verifyMobileTimeline(SUBMISSION, many).ok, false);
  });
});

describe("Stage 2 — asset verification is unchanged from Stage 1", () => {
  it("still refuses an asset from ANOTHER submission's namespace", () => {
    const foreign: MobileTimelineInput = {
      id: "p1",
      kind: "image",
      slot: "photo-1",
      asset: photoAsset("photo-1", {
        publicId: buildMobilePublicId(OTHER_SUBMISSION, "photo1", ATTEMPT),
      }),
    };
    assert.equal(verifyMobileTimeline(SUBMISSION, [foreign]).ok, false);
  });

  it("still refuses an arbitrary Cloudinary public id", () => {
    for (const publicId of [
      "issue-tracker/intake/some-desktop-upload",
      "issue-tracker/ND-001/recording-001",
      "some-other-account-asset",
      "",
    ]) {
      const item: MobileTimelineInput = {
        id: "p1",
        kind: "image",
        slot: "photo-1",
        asset: photoAsset("photo-1", { publicId }),
      };
      assert.equal(verifyMobileTimeline(SUBMISSION, [item]).ok, false, `${publicId} must be refused`);
    }
  });

  it("still refuses a mismatched slot, resource type, format, size and scheme", () => {
    const mismatches: MobileTimelineInput[][] = [
      // asset stored under photo-2 but declared as photo-1
      [{ id: "a", kind: "image", slot: "photo-1", asset: photoAsset("photo-2") }],
      // an image declared in the voice slot
      [{ id: "b", kind: "voice", slot: "voice", asset: photoAsset("voice") }],
      [{ id: "c", kind: "image", slot: "photo-1", asset: photoAsset("photo-1", { format: "heic" }) }],
      [{ id: "d", kind: "image", slot: "photo-1", asset: photoAsset("photo-1", { bytes: 6_000_000 }) }],
      [
        {
          id: "e",
          kind: "image",
          slot: "photo-1",
          asset: photoAsset("photo-1", { secureUrl: "http://x/a.jpg" }),
        },
      ],
    ];
    for (const items of mismatches) {
      assert.equal(verifyMobileTimeline(SUBMISSION, items).ok, false, JSON.stringify(items[0].id));
    }
  });

  it("refuses a photo declared in the voice slot and vice versa", () => {
    assert.equal(
      verifyMobileTimeline(SUBMISSION, [
        { id: "a", kind: "image", slot: "voice", asset: voiceAsset() },
      ]).ok,
      false
    );
    assert.equal(
      verifyMobileTimeline(SUBMISSION, [
        { id: "b", kind: "voice", slot: "photo-1", asset: photoAsset("photo-1") },
      ]).ok,
      false
    );
  });
});

describe("Stage 2 — text and caption normalisation", () => {
  it("collapses whitespace and trims", () => {
    assert.equal(normaliseMobileText("  belt   jammed \r\n badly ", 100), "belt jammed\nbadly");
    assert.equal(normaliseMobileText("", 100), "");
    assert.equal(normaliseMobileText(null, 100), "");
    assert.equal(normaliseMobileText(7, 100), "");
  });

  it("caps length rather than rejecting a long note", () => {
    const long = "x".repeat(MOBILE_MAX_TEXT_LENGTH + 500);
    assert.equal(normaliseMobileText(long, MOBILE_MAX_TEXT_LENGTH).length, MOBILE_MAX_TEXT_LENGTH);
  });

  it("a blank caption normalises to null, never an empty string", () => {
    assert.equal(normaliseMobileCaption("   "), null);
    assert.equal(normaliseMobileCaption(undefined), null);
    assert.equal(normaliseMobileCaption("  Broken carton "), "Broken carton");
    assert.equal(
      normaliseMobileCaption("y".repeat(MOBILE_MAX_CAPTION_LENGTH + 50))!.length,
      MOBILE_MAX_CAPTION_LENGTH
    );
  });

  it("normalisation happens on the way in, not on the client's word", () => {
    const items = verified([textItem("t1", "  spaced   out  ")]);
    assert.equal(items[0].kind === "text" ? items[0].text : "", "spaced out");
  });
});

describe("Stage 2 — the human-readable description", () => {
  it("keeps the worker's messages in the order they were written", () => {
    const items = verified([
      textItem("t1", "Conveyor belt jammed"),
      textItem("t2", "Line stopped at 09:40"),
    ]);
    assert.equal(buildMobileDescription(items), "Conveyor belt jammed\nLine stopped at 09:40");
  });

  it("writes each caption with the exact 'Caption: ' prefix, in order", () => {
    const items = verified([
      textItem("t1", "Damage found on arrival"),
      imageItem("p1", 1, "Broken outer carton"),
      imageItem("p2", 2, "Product visible through tear"),
    ]);
    assert.equal(
      buildMobileDescription(items),
      "Damage found on arrival\nCaption: Broken outer carton\nCaption: Product visible through tear"
    );
    assert.equal(MOBILE_CAPTION_PREFIX, "Caption: ");
  });

  it("a photo with NO caption contributes no line at all", () => {
    const items = verified([imageItem("p1", 1), imageItem("p2", 2, "Second one is the damaged one")]);
    const description = buildMobileDescription(items);
    assert.equal(description, "Caption: Second one is the damaged one");
    // No placeholder of any kind for the uncaptioned photo.
    assert.equal((description.match(/Caption:/g) ?? []).length, 1);
    for (const placeholder of ["Caption:\n", "Caption: \n", "No caption", "N/A", "Photo Caption"]) {
      assert.equal(description.includes(placeholder), false, `must not emit "${placeholder}"`);
    }
  });

  it("worker text is stored unlabelled — only captions carry a prefix", () => {
    const items = verified([textItem("t1", "Machine damaged near belt")]);
    assert.equal(buildMobileDescription(items), "Machine damaged near belt");
  });

  it("keeps text and captions in the order the worker built them", () => {
    const items = verified([
      textItem("t1", "Box arrived damaged"),
      imageItem("p1", 1, "Outer carton torn"),
      textItem("t2", "Product may also be scratched"),
      imageItem("p2", 2),
      imageItem("p3", 3, "Scratch visible on product"),
    ]);
    assert.equal(
      buildMobileDescription(items),
      [
        "Box arrived damaged",
        "Caption: Outer carton torn",
        "Product may also be scratched",
        "Caption: Scratch visible on product",
      ].join("\n")
    );
  });

  it("adds no caption column — the description IS the storage", () => {
    // The whole caption feature writes to issue_description and extra_data
    // only. Nothing anywhere asks for a new column or a migration.
    const registrationSource = readFileSync(
      join(process.cwd(), "lib/mobile/mobileRegistration.ts"),
      "utf8"
    );
    for (const forbidden of [
      "caption_column",
      "photo_caption",
      "image_caption",
      "ALTER TABLE",
      "CREATE TABLE",
      "ADD COLUMN",
      "CREATE INDEX",
    ]) {
      assert.equal(registrationSource.includes(forbidden), false, `must not introduce ${forbidden}`);
    }
  });

  it("falls back only when there is no worker text at all", () => {
    const mediaOnly = verified([imageItem("p1", 1), voiceInput("v1")]);
    assert.equal(buildMobileDescription(mediaOnly), MOBILE_FALLBACK_DESCRIPTION);
    assert.equal(MOBILE_FALLBACK_DESCRIPTION, "Warehouse mobile evidence report.");
  });

  it("never leaks a Cloudinary URL or an internal id", () => {
    const items = verified([
      textItem("t1", "Note"),
      imageItem("p1", 1, "Caption"),
      voiceInput("v1"),
    ]);
    const description = buildMobileDescription(items);
    for (const forbidden = "res.cloudinary.com"; ; ) {
      assert.equal(description.includes(forbidden), false);
      break;
    }
    assert.equal(description.includes(SUBMISSION), false);
    assert.equal(description.includes(ATTEMPT), false);
    assert.equal(description.includes("issue-tracker/mobile"), false);
  });
});

describe("Stage 2 — extra_data keeps every existing consumer working", () => {
  const items = verified([
    textItem("t1", "Damage on arrival"),
    imageItem("p1", 1, "Broken outer carton"),
    voiceInput("v1"),
    imageItem("p2", 2),
  ]);
  const extra = buildMobileTimelineExtraData(SUBMISSION, items);

  it("still writes the legacy three-key images shape the gallery renders", () => {
    const images = extra.images as Array<Record<string, unknown>>;
    assert.equal(images.length, 2);
    for (const image of images) {
      assert.deepEqual(Object.keys(image).sort(), ["original_name", "public_id", "url"]);
    }
  });

  it("still writes attachments the existing audio player can read", () => {
    const audio = readAudioAttachments(extra.attachments);
    assert.equal(audio.length, 1);
    assert.equal(audio[0].source, "voice_recording");
    assert.ok(ASSIGNEE_VISIBLE_SOURCES.includes(audio[0].source));
  });

  it("keeps the submission id and the source marker", () => {
    assert.equal(extra[MOBILE_SUBMISSION_KEY], SUBMISSION);
    assert.equal(extra[MOBILE_SOURCE_KEY], MOBILE_SOURCE_VALUE);
  });

  it("adds the ordered timeline additively, without removing anything", () => {
    const timeline = extra[MOBILE_TIMELINE_KEY] as Array<Record<string, unknown>>;
    assert.deepEqual(timeline.map((entry) => entry.kind), ["text", "image", "voice", "image"]);
    assert.deepEqual(timeline.map((entry) => entry.id), ["t1", "p1", "v1", "p2"]);
    // Existing keys survive alongside it.
    assert.ok(Array.isArray(extra.images));
    assert.ok(Array.isArray(extra.attachments));
  });

  it("keeps each caption bound to its own image, and null when absent", () => {
    const timeline = extra[MOBILE_TIMELINE_KEY] as Array<Record<string, unknown>>;
    const images = timeline.filter((entry) => entry.kind === "image");
    assert.equal(images[0].caption, "Broken outer carton");
    assert.equal(images[1].caption, null);
  });

  it("references assets by the SAME public_id already stored elsewhere", () => {
    const timeline = extra[MOBILE_TIMELINE_KEY] as Array<Record<string, unknown>>;
    const images = extra.images as Array<Record<string, unknown>>;
    const timelineImages = timeline.filter((entry) => entry.kind === "image");
    assert.deepEqual(
      timelineImages.map((entry) => entry.public_id),
      images.map((image) => image.public_id)
    );
  });

  it("carries no credential of any kind", () => {
    const serialised = JSON.stringify(extra);
    for (const forbidden of ["api_key", "api_secret", "signature", "apiKey", "apiSecret"]) {
      assert.equal(serialised.includes(forbidden), false, `must not carry ${forbidden}`);
    }
  });

  it("images and attachments follow timeline order", () => {
    const images = extra.images as Array<Record<string, unknown>>;
    assert.deepEqual(
      images.map((image) => image.original_name),
      ["evidence-photo-1.jpg", "evidence-photo-2.jpg"]
    );
  });
});

describe("Stage 2 — the registration action wires the new contract", () => {
  const actionSource = readFileSync(join(process.cwd(), "app/mobile/register-actions.ts"), "utf8");

  it("verifies the timeline on the server before anything else", () => {
    assert.ok(actionSource.includes("verifyMobileTimeline(input.submissionId, input.items)"));
    // The authentication gate comes first, then the timeline verification.
    assert.ok(
      actionSource.indexOf("await getCurrentUser()") <
        actionSource.indexOf("verifyMobileTimeline(input.submissionId")
    );
  });

  it("derives the description from the verified items, never from the client", () => {
    assert.ok(actionSource.includes("description: buildMobileDescription(timeline.items)"));
    assert.equal(actionSource.includes("input.description"), false);
  });

  it("still derives staff code, category and title server-side", () => {
    // The raiser is now server-resolved from the session, not a fixed constant.
    assert.ok(actionSource.includes("staffCode: raiser.staffCode"));
    assert.ok(actionSource.includes("category: MOBILE_CATEGORY"));
    assert.ok(actionSource.includes("title: buildMobileIssueTitleForItems(timeline.items, new Date())"));
  });

  it("introduces no schema change or migration", () => {
    for (const forbidden of ["CREATE TABLE", "ALTER TABLE", "DROP TABLE", "CREATE INDEX", "TRUNCATE"]) {
      assert.equal(actionSource.includes(forbidden), false, `must not contain ${forbidden}`);
    }
  });
});
