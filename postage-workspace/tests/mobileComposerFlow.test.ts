import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import {
  addPhoto,
  adjacentPhotoId,
  canAddPhoto,
  draftSummary,
  draftToRegistrationItems,
  emptyIssueDraft,
  isDraftBusy,
  isDraftSendable,
  isDraftValid,
  mediaFailed,
  mediaUploaded,
  nextPhotoSlot,
  photoCount,
  photoIndex,
  removePhoto,
  setDraftText,
  setPhotoCaption,
  setVoice,
  type IssueDraft,
} from "../lib/mobile/mobileDraft";
import {
  buildMobileDescription,
  verifyMobileTimeline,
  type SubmittedAsset,
} from "../lib/mobile/mobileRegistration";
import { buildMobilePublicId } from "../lib/mobile/mobileAccess";

// Warehouse Mobile Lite — STAGE 2: the Issue Draft, driven as STATE.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Manual UAT found a bug the previous tests could not have caught, because they
// asserted only that certain strings were absent from the source. A worker who
// typed a note and then added a photo saw the note disappear from view, and it
// registered AFTER the photo instead of before it.
//
// These tests drive the actual state transitions the composer performs, through
// the very functions it calls, and assert what the worker ends up with. The
// registration action is a counting fake: NO Issue is created, NO database is
// touched and NO Cloudinary asset exists anywhere in this file.

const SUBMISSION = "0b6a3d2e-1c4f-4a7b-9e2d-8f5c1a3b7d90";
const ATTEMPT = "7c1e5a94-2b6d-4f83-9a10-3e8b2d6c4f57";
const NOTE = "Box damaged near loading area";

function photoAsset(slot: string): SubmittedAsset {
  return {
    publicId: `issue-tracker/mobile/${SUBMISSION}/${slot}/${ATTEMPT}`,
    secureUrl: "https://res.cloudinary.com/demo/a.jpg",
    bytes: 1_500_000,
    format: "jpg",
    resourceType: "image",
  };
}

function voiceAsset(): SubmittedAsset {
  return {
    publicId: buildMobilePublicId(SUBMISSION, "voice", ATTEMPT),
    secureUrl: "https://res.cloudinary.com/demo/a.webm",
    bytes: 400_000,
    format: "webm",
    resourceType: "video",
  };
}

/**
 * A stand-in for the composer's own state and the order in which it changes.
 * Every method mirrors ONE worker action and calls exactly the shared draft
 * functions the component calls — nothing is re-implemented here.
 */
type Screen = "main" | "photo" | "voice";

class Composer {
  draft: IssueDraft = emptyIssueDraft();
  screen: Screen = "main";
  reviewPhotoId: string | null = null;
  confirming = false;
  confirmOrigin: Screen = "main";
  registerCalls = 0;
  lastPayload: ReturnType<typeof draftToRegistrationItems> | null = null;
  registeredId: string | null = null;
  /** Every Issue registered in this page session, in order. */
  submittedIssues: Array<{ issueId: string; draft: IssueDraft }> = [];
  failure: string | null = null;
  readonly submissionIdAtStart = SUBMISSION;
  submissionId = SUBMISSION;
  submissionIds: string[] = [SUBMISSION];

  type(value: string) {
    this.draft = setDraftText(this.draft, value);
  }

  /**
   * Camera or Gallery: the photo is STAGED IMMEDIATELY and the review screen
   * opens on it. There is no Add Photo step.
   */
  selectPhoto() {
    const id = `photo-item-${photoCount(this.draft) + 1}`;
    this.draft = addPhoto(this.draft, {
      id,
      slot: nextPhotoSlot(this.draft)!,
      attemptId: crypto.randomUUID(),
    });
    this.reviewPhotoId = id;
    this.screen = "photo";
    return id;
  }

  /**
   * The GALLERY: every picked file is staged at once, capped at ten, and the
   * worker stays on the draft. No review screen opens, whatever the count.
   */
  selectPhotos(count: number) {
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      const slot = nextPhotoSlot(this.draft);
      if (!slot) break; // the cap, enforced exactly as the composer enforces it
      const id = `photo-item-${photoCount(this.draft) + 1}`;
      this.draft = addPhoto(this.draft, { id, slot, attemptId: crypto.randomUUID() });
      ids.push(id);
    }
    return ids;
  }

  /** One upload that did not land. */
  uploadFailed(id: string, error: string) {
    this.draft = mediaFailed(this.draft, id, error);
  }

  /** Tapping a thumbnail to open its review. */
  openPhoto(id: string) {
    this.reviewPhotoId = id;
    this.screen = "photo";
  }

  /** The Previous / Next arrow on the review screen. */
  stepPhoto(step: -1 | 1) {
    const neighbour = adjacentPhotoId(this.draft, this.reviewPhotoId, step);
    if (neighbour) this.reviewPhotoId = neighbour;
  }

  /** The × on a thumbnail. */
  removePhoto(id: string) {
    this.draft = removePhoto(this.draft, id);
    if (this.reviewPhotoId === id) {
      this.reviewPhotoId = null;
      this.screen = "main";
    }
  }

  /** Typing a caption on the review screen, onto the already-staged photo. */
  caption(text: string) {
    assert.ok(this.reviewPhotoId, "a caption needs a photo under review");
    this.draft = setPhotoCaption(this.draft, this.reviewPhotoId, text);
  }

  /** Mic or + → Voice: the recording is STAGED and its review opens. */
  recordVoice() {
    const id = `voice-item-${crypto.randomUUID().slice(0, 8)}`;
    this.draft = setVoice(this.draft, { id, attemptId: crypto.randomUUID() });
    this.screen = "voice";
    return id;
  }

  /** "Back to issue" from a review screen. The media stays staged. */
  backToIssue() {
    this.screen = "main";
    this.reviewPhotoId = null;
  }

  uploadDone(id: string, asset: SubmittedAsset) {
    this.draft = mediaUploaded(this.draft, id, {
      publicId: asset.publicId,
      secureUrl: asset.secureUrl,
      bytes: asset.bytes,
      format: asset.format,
      resourceType: asset.resourceType as "image" | "video",
    });
  }

  get busy() {
    return isDraftBusy(this.draft);
  }

  /**
   * requestSendCurrentDraft(origin) — the ONE send request, shared by all three
   * screens. WRITES NOTHING and always inspects the COMPLETE draft.
   */
  send(origin: Screen = this.screen) {
    if (this.busy) return;
    if (!isDraftSendable(this.draft)) return;
    this.failure = null;
    this.confirmOrigin = origin;
    this.confirming = true;
  }

  /** Back-compat alias for the main-composer send. */
  mainSend() {
    this.send("main");
  }

  /** "Back" from the confirmation — returns to the screen it came from. */
  back() {
    this.confirming = false;
    this.screen = this.confirmOrigin;
  }

  /**
   * "Yes, Send Issue" — confirmSend(). The ONE write.
   *
   * On success the draft is SNAPSHOT first and then emptied, exactly as the
   * component does it: the worker sees what they sent, and a clean composer.
   * On failure nothing is snapshot and nothing is cleared.
   */
  confirm(outcome: "ok" | "fail" = "ok", issueId = "WH-008") {
    if (!isDraftSendable(this.draft)) return;
    this.confirming = false;
    this.registerCalls += 1;
    this.lastPayload = draftToRegistrationItems(this.draft);
    if (outcome !== "ok") {
      this.failure = "Could not register this Issue. Please try again.";
      return;
    }
    this.submittedIssues = [...this.submittedIssues, { issueId, draft: this.draft }];
    this.registeredId = issueId;
    this.startNextIssue();
  }

  /**
   * startNextIssue() — CLIENT STATE ONLY, and automatic on success. No reload,
   * no router call, no navigation, no button. A new submission id, an empty
   * draft, and the history stays.
   */
  startNextIssue() {
    this.submissionId = crypto.randomUUID();
    this.submissionIds.push(this.submissionId);
    this.draft = emptyIssueDraft();
    this.reviewPhotoId = null;
    this.failure = null;
    this.screen = "main";
  }

  /** What the server would store, through the real verifier and writer. */
  description() {
    const check = verifyMobileTimeline(SUBMISSION, this.lastPayload);
    assert.equal(check.ok, true, check.ok ? "" : check.error);
    return check.ok ? buildMobileDescription(check.items) : "";
  }

  kinds() {
    return (this.lastPayload ?? []).map((item) => item.kind);
  }
}

/** Selects a photo (staged at once), optionally captions it, waits for the
 *  upload, and returns to the main draft. */
function withPhoto(c: Composer, caption = "") {
  const id = c.selectPhoto();
  if (caption) c.caption(caption);
  c.uploadDone(id, photoAsset(`photo-${photoCount(c.draft)}`));
  c.backToIssue();
  return id;
}

function withVoice(c: Composer) {
  const id = c.recordVoice();
  c.uploadDone(id, voiceAsset());
  c.backToIssue();
  return id;
}

// ---------------------------------------------------------------------------

describe("Issue Draft — every shape is a complete Issue", () => {
  const shapes: Array<[string, (c: Composer) => void, string[]]> = [
    ["text only", (c) => c.type(NOTE), ["text"]],
    ["photo only", (c) => void withPhoto(c), ["image"]],
    [
      "multiple photos only",
      (c) => {
        withPhoto(c);
        withPhoto(c);
        withPhoto(c);
      },
      ["image", "image", "image"],
    ],
    ["voice only", (c) => void withVoice(c), ["voice"]],
    [
      "text + photo",
      (c) => {
        c.type(NOTE);
        withPhoto(c);
      },
      ["text", "image"],
    ],
    [
      "text + multiple photos",
      (c) => {
        c.type(NOTE);
        withPhoto(c);
        withPhoto(c);
      },
      ["text", "image", "image"],
    ],
    [
      "text + voice",
      (c) => {
        c.type(NOTE);
        withVoice(c);
      },
      ["text", "voice"],
    ],
    [
      "photo + voice",
      (c) => {
        withPhoto(c);
        withVoice(c);
      },
      ["image", "voice"],
    ],
    [
      "multiple photos + voice",
      (c) => {
        withPhoto(c);
        withPhoto(c);
        withVoice(c);
      },
      ["image", "image", "voice"],
    ],
    [
      "text + photo + voice",
      (c) => {
        c.type(NOTE);
        withPhoto(c);
        withVoice(c);
      },
      ["text", "image", "voice"],
    ],
  ];

  for (const [name, build, expected] of shapes) {
    it(`${name} is valid, must be confirmed, and registers exactly once`, () => {
      const c = new Composer();
      build(c);

      assert.equal(isDraftValid(c.draft), true, `${name} must be a valid Issue`);
      assert.equal(c.registerCalls, 0, "nothing registers while composing");

      c.mainSend();
      assert.equal(c.confirming, true, `${name} must show "Ready to send?"`);
      assert.equal(c.registerCalls, 0, "main send must NOT register");

      c.back();
      assert.equal(c.confirming, false);
      assert.equal(c.registerCalls, 0, "Back must not register");

      c.mainSend();
      c.confirm();
      assert.equal(c.registerCalls, 1, `${name} must register exactly once`);
      assert.deepEqual(c.kinds(), expected, `${name} payload`);
    });
  }

  it("an empty draft is not valid and cannot be sent", () => {
    const c = new Composer();
    assert.equal(isDraftValid(c.draft), false);
    c.mainSend();
    assert.equal(c.confirming, false);
    c.confirm();
    assert.equal(c.registerCalls, 0);
  });

  it("whitespace alone is not a valid Issue", () => {
    const c = new Composer();
    c.type("    \n  ");
    assert.equal(isDraftValid(c.draft), false);
  });
});

describe("Issue Draft — the note survives every media flow", () => {
  it("survives Gallery", () => {
    const c = new Composer();
    c.type(NOTE);
    const id = c.selectPhoto();
    assert.equal(c.draft.text, NOTE, "Add Photo must not touch the note");
    assert.equal(c.registerCalls, 0);
    assert.equal(c.confirming, false, "Add Photo must not open the confirmation");
    c.uploadDone(id, photoAsset("photo-1"));
    assert.equal(c.draft.text, NOTE, "the upload landing must not touch the note");
  });

  it("survives Camera", () => {
    const c = new Composer();
    c.type(NOTE);
    const id = c.selectPhoto();
    c.caption("Outer carton torn");
    c.uploadDone(id, photoAsset("photo-1"));
    assert.equal(c.draft.text, NOTE);
    assert.equal(c.draft.photos[0].caption, "Outer carton torn");
  });

  it("survives Voice", () => {
    const c = new Composer();
    const spoken = "Machine making unusual noise";
    c.type(spoken);
    const id = c.recordVoice();
    assert.equal(c.draft.text, spoken, "recording must not touch the note");
    assert.equal(c.registerCalls, 0, "recording must not register");
    c.uploadDone(id, voiceAsset());
    assert.equal(c.draft.text, spoken);

    c.mainSend();
    c.confirm();
    assert.deepEqual(c.kinds(), ["text", "voice"], "never voice-only when text exists");
    assert.equal(c.description(), spoken);
  });

  it("photos survive a later recording, and the recording survives later photos", () => {
    const c = new Composer();
    c.type(NOTE);
    withPhoto(c, "first");
    withVoice(c);
    assert.equal(photoCount(c.draft), 1, "the photo survived the recording");

    withPhoto(c, "second");
    assert.equal(c.draft.voice !== null, true, "the recording survived the next photo");
    assert.equal(photoCount(c.draft), 2);
    assert.equal(c.draft.text, NOTE, "and the note survived all of it");

    c.mainSend();
    c.confirm();
    assert.deepEqual(c.kinds(), ["text", "image", "image", "voice"]);
    assert.equal(c.registerCalls, 1);
  });

  it("send is unavailable — and never fires — while an upload is in flight", () => {
    const c = new Composer();
    c.type(NOTE);
    const id = c.selectPhoto();

    assert.equal(c.busy, true);
    assert.equal(isDraftSendable(c.draft), false);
    c.mainSend();
    assert.equal(c.confirming, false, "no confirmation while uploading");

    c.uploadDone(id, photoAsset("photo-1"));
    assert.equal(c.busy, false);
    c.mainSend();
    assert.equal(c.confirming, true);
  });
});

describe("Issue Draft — deterministic registration order", () => {
  it("registers text, then photos in the order added, then voice", () => {
    const c = new Composer();
    // Deliberately built in a different order from the one it registers in.
    withVoice(c);
    withPhoto(c, "second added");
    c.type(NOTE);
    withPhoto(c, "third added");

    c.mainSend();
    c.confirm();
    assert.deepEqual(c.kinds(), ["text", "image", "image", "voice"]);
    assert.equal(
      c.description(),
      `${NOTE}\nCaption: second added\nCaption: third added`,
      "the note leads, then each caption in the order its photo was added"
    );
  });

  it("the note never lands after a caption", () => {
    const c = new Composer();
    c.type(NOTE);
    withPhoto(c, "Outer carton torn");
    c.mainSend();
    c.confirm();

    assert.equal(c.description(), `${NOTE}\nCaption: Outer carton torn`);
    assert.notEqual(c.description(), `Caption: Outer carton torn\n${NOTE}`);
  });

  it("a photo with no caption contributes no line", () => {
    const c = new Composer();
    c.type(NOTE);
    withPhoto(c);
    c.mainSend();
    c.confirm();

    assert.equal(c.description(), NOTE);
    for (const placeholder of ["Caption:", "No caption", "N/A"]) {
      assert.equal(c.description().includes(placeholder), false, `must not emit "${placeholder}"`);
    }
  });

  it("a media-only Issue falls back rather than inventing worker text", () => {
    const c = new Composer();
    withPhoto(c);
    withVoice(c);
    c.mainSend();
    c.confirm();
    assert.equal(c.description(), "Warehouse mobile evidence report.");
  });
});

describe("Issue Draft — the confirmation is the only door to registration", () => {
  it("no media action registers or confirms", () => {
    const c = new Composer();
    c.type(NOTE);
    const p = c.selectPhoto();
    c.caption("cap");
    c.uploadDone(p, photoAsset("photo-1"));
    const v = c.recordVoice();
    c.uploadDone(v, voiceAsset());

    assert.equal(c.registerCalls, 0);
    assert.equal(c.confirming, false);
  });

  it("Back preserves the whole draft byte for byte", () => {
    const c = new Composer();
    c.type(NOTE);
    withPhoto(c, "Outer carton torn");
    withVoice(c);

    const before = JSON.stringify(c.draft);
    c.mainSend();
    c.back();

    assert.equal(JSON.stringify(c.draft), before, "Back must change nothing");
    assert.equal(c.registerCalls, 0);
  });

  it("a failure keeps the draft, and the retry must be confirmed again", () => {
    const c = new Composer();
    c.type(NOTE);
    withPhoto(c, "Outer carton torn");
    withVoice(c);

    c.mainSend();
    c.confirm("fail");
    assert.equal(c.registerCalls, 1);
    assert.equal(c.registeredId, null, "a failure does not complete the Issue");
    assert.equal(c.confirming, false, "the confirmation closed");
    assert.equal(c.draft.text, NOTE, "the note is kept");
    assert.equal(photoCount(c.draft), 1, "the photo is kept");
    assert.equal(c.draft.photos[0].caption, "Outer carton torn", "the caption is kept");
    assert.equal(c.draft.voice !== null, true, "the recording is kept");

    c.mainSend();
    assert.equal(c.confirming, true, "no confirmation bypass on retry");
    c.confirm();
    assert.equal(c.registerCalls, 2);
  });

  it("a completed Issue cannot be sent again", () => {
    const c = new Composer();
    c.type(NOTE);
    c.mainSend();
    c.confirm();
    assert.equal(c.registerCalls, 1);

    c.mainSend();
    assert.equal(c.confirming, false, "send is locked after success");
    c.confirm();
    assert.equal(c.registerCalls, 1, "no second registration for the same Issue");
  });
});

describe("UAT bug — an unsent draft must never look sent", () => {
  // The reported scenario, exactly: type "test", pick a photo, come back
  // without sending. Both appeared as outgoing chat bubbles, which reads as
  // "already delivered". They belong in the composer's draft tray instead.
  const composerSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");
  const code = composerSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  /** Everything the timeline area renders. */
  const timeline = code.slice(code.indexOf("style={chatBackground}"), code.indexOf("DRAFT TRAY"));
  /** Everything the draft tray renders. */
  const tray = code.slice(code.indexOf("DRAFT TRAY"), code.indexOf("BOTTOM BAR"));

  it("state: the note stays in the input and the photo is staged", () => {
    const c = new Composer();
    c.type("test");
    const id = c.selectPhoto();
    c.uploadDone(id, photoAsset("photo-1"));
    c.backToIssue();

    assert.equal(c.draft.text, "test", "the input still holds the note");
    assert.equal(photoCount(c.draft), 1, "the photo is staged in the same draft");
    assert.equal(c.registerCalls, 0, "nothing was registered");
    assert.equal(isDraftSendable(c.draft), true, "Send is available");
    assert.equal(c.screen, "main");
  });

  it("the timeline renders NO part of the unsent draft", () => {
    // The sent SNAPSHOT legitimately renders here — it really was submitted.
    // What must never appear is the ACTIVE draft, so its readings are removed
    // before checking.
    const unsentOnly = timeline.split("issue.draft.").join("SNAPSHOT_");
    for (const draftPiece of ["draft.text", "draft.photos.map", "draft.voice &&", "draft.voice.previewUrl"]) {
      assert.equal(
        unsentOnly.includes(draftPiece),
        false,
        `the timeline must not render ${draftPiece} — that is what looked "sent"`
      );
    }
    // What it MAY carry: the notice, and the real outcome afterwards.
    assert.ok(timeline.includes("Tell us what happened"));
    assert.ok(timeline.includes("Issue Registered"));
    assert.ok(timeline.includes("Registration Failed"));
  });

  it("the draft tray is where photos and voice live, above the composer", () => {
    assert.ok(tray.includes("draft.photos.map"), "thumbnails belong to the tray");
    assert.ok(tray.includes("draft.voice"), "the recording belongs to the tray");
    assert.ok(tray.includes("Not sent yet"), "and it says so");
    assert.ok(tray.includes("overflow-x-auto"), "thumbnails scroll rather than overflow the page");
    assert.ok(tray.includes("h-16 w-16"), "compact thumbnails, not full bubbles");
    // It is hidden once the Issue really has been sent.
    assert.ok(tray.includes('screen === "main"'));
  });

  it("outgoing-bubble styling reaches sent content only", () => {
    // It is correct for a REGISTERED Issue to look sent. What caused the bug
    // was the unsent draft wearing the same styling, so the check is that the
    // tray and the composer do not.
    const tray = code.slice(code.indexOf("DRAFT TRAY"), code.indexOf("BOTTOM BAR"));
    const bottom = code.slice(code.indexOf("BOTTOM BAR"));
    for (const style of ["rounded-br-md", "sentBubbleClassName"]) {
      assert.equal(tray.includes(style), false, `the unsent tray must not use "${style}"`);
      assert.equal(bottom.includes(style), false, `the composer must not use "${style}"`);
    }
  });

  it("state: every draft shape stays unsent until the confirmation is accepted", () => {
    const shapes: Array<[string, (c: Composer) => void]> = [
      ["photo only", (c) => void withPhoto(c)],
      ["voice only", (c) => void withVoice(c)],
      [
        "text + photo",
        (c) => {
          c.type("test");
          withPhoto(c);
        },
      ],
      [
        "text + 3 photos",
        (c) => {
          c.type("test");
          withPhoto(c);
          withPhoto(c);
          withPhoto(c);
        },
      ],
      [
        "text + voice",
        (c) => {
          c.type("test");
          withVoice(c);
        },
      ],
      [
        "text + photo + voice",
        (c) => {
          c.type("test");
          withPhoto(c);
          withVoice(c);
        },
      ],
    ];

    for (const [name, build] of shapes) {
      const c = new Composer();
      build(c);
      assert.equal(c.registerCalls, 0, `${name}: nothing sent while composing`);
      assert.equal(c.registeredId, null, `${name}: no Issue exists yet`);
      assert.equal(isDraftSendable(c.draft), true, `${name}: Send is available`);
      // And the note is never moved out of the input.
      if (name.startsWith("text")) assert.equal(c.draft.text, "test", `${name}: the note is intact`);
    }
  });

  it("state: Back from the confirmation restores the identical draft", () => {
    const c = new Composer();
    c.type("test");
    withPhoto(c, "Outer carton torn");
    withVoice(c);

    const before = JSON.stringify(c.draft);
    c.send("main");
    c.back();

    assert.equal(JSON.stringify(c.draft), before);
    assert.equal(c.registerCalls, 0);
    assert.equal(c.registeredId, null, "still unsent");
  });

  it("the success bubble appears only after the backend really succeeded", () => {
    const c = new Composer();
    c.type("test");
    withPhoto(c);

    c.send("main");
    assert.equal(c.registeredId, null, "no success before Yes");
    c.confirm("fail");
    assert.equal(c.registeredId, null, "no success on failure");
    c.send("main");
    c.confirm("ok");
    assert.equal(c.registeredId, "WH-008", "success only once the write returned an id");
  });
});

describe("Gallery goes straight to the draft; the camera still reviews", () => {
  const composerSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");
  const code = composerSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

  it("the helper copy is the new wording, in the same place", () => {
    assert.ok(code.includes("Tell us what happened"));
    assert.ok(code.includes("Add a note, photos or a voice message. Send when you"));
    assert.equal(code.includes("One issue, one send."), false, "old line removed");
    assert.equal(
      code.includes("Add text, photos or voice — use one or combine them."),
      false,
      "old line removed"
    );
    // Same notice card, same condition — only the words changed.
    assert.ok(code.includes("{showNotice && ("));
    // And it is not duplicated: one helper, in the draft area.
    assert.equal((code.match(/Tell us what happened/g) ?? []).length, 1);
  });

  it("the camera opens a review; the gallery never does", () => {
    assert.ok(code.includes("await stagePhotos(files, true);"), "camera reviews");
    assert.ok(code.includes("await stagePhotos(files, false);"), "gallery does not");
    assert.ok(code.includes("if (review && staged === 1 && lastId)"));
    // The gallery input is the multi-select one.
    const gallery = code.slice(code.indexOf("ref={galleryInputRef}"), code.indexOf("BODY:"));
    assert.ok(gallery.includes("multiple"));
    assert.ok(gallery.includes("stagePhotos(files, false)"));
    const camera = code.slice(code.indexOf("ref={cameraInputRef}"), code.indexOf("ref={galleryInputRef}"));
    assert.equal(camera.includes("multiple"), false, "the camera takes one photo");
    assert.ok(camera.includes('capture="environment"'));
  });

  it("state: text + three gallery photos, no review, nothing registered", () => {
    const c = new Composer();
    c.type("test");
    const ids = c.selectPhotos(3);

    assert.equal(c.screen, "main", "no photo review opened");
    assert.equal(c.draft.text, "test", "the note is untouched");
    assert.equal(photoCount(c.draft), 3, "all three are in the draft at once");
    assert.equal(c.registerCalls, 0, "selecting photos registers nothing");

    // They arrive uploading, each with its own state.
    assert.ok(c.draft.photos.every((photo) => photo.status === "uploading"));
    assert.equal(isDraftSendable(c.draft), false, "not sendable until they land");

    // …and they finish independently.
    c.uploadDone(ids[0], photoAsset("photo-1"));
    c.uploadDone(ids[2], photoAsset("photo-3"));
    assert.deepEqual(
      c.draft.photos.map((photo) => photo.status),
      ["uploaded", "uploading", "uploaded"],
      "one photo's progress does not wait on another"
    );

    c.uploadDone(ids[1], photoAsset("photo-2"));
    assert.equal(isDraftSendable(c.draft), true);
    assert.equal(c.draft.text, "test", "still there after every upload");
  });

  it("state: even ONE gallery photo skips the review", () => {
    const c = new Composer();
    c.selectPhotos(1);
    assert.equal(c.screen, "main", "the gallery never reviews, whatever the count");
    assert.equal(photoCount(c.draft), 1);
  });

  it("state: the single-photo CAMERA flow still opens its review, with captions", () => {
    const c = new Composer();
    c.type("test");
    const id = c.selectPhoto();
    assert.equal(c.screen, "photo", "the camera capture is reviewed");
    c.caption("Outer carton torn");
    assert.equal(c.draft.photos[0].caption, "Outer carton torn");
    assert.equal(c.draft.text, "test");
    c.uploadDone(id, photoAsset("photo-1"));
    c.backToIssue();
    assert.equal(photoCount(c.draft), 1);
    assert.equal(c.registerCalls, 0);
  });

  it("state: one failed upload disturbs nothing else", () => {
    const c = new Composer();
    c.type("test");
    const photos = c.selectPhotos(3);
    const voice = c.recordVoice();
    c.backToIssue();

    c.uploadDone(photos[0], photoAsset("photo-1"));
    c.uploadFailed(photos[1], "Upload failed.");
    c.uploadDone(photos[2], photoAsset("photo-3"));
    c.uploadDone(voice, voiceAsset());

    assert.equal(c.draft.text, "test", "the note survives a failure");
    assert.equal(photoCount(c.draft), 3, "no photo is dropped");
    assert.deepEqual(
      c.draft.photos.map((photo) => photo.status),
      ["uploaded", "failed", "uploaded"],
      "only the failed one is marked"
    );
    assert.equal(c.draft.voice?.status, "uploaded", "the recording is unaffected");
    assert.equal(c.registerCalls, 0);
    assert.equal(isDraftSendable(c.draft), false, "and Send waits for it");

    // A retry is offered, and clears the block.
    assert.ok(composerSource.includes("reviewPhoto.status === \"failed\""));
    assert.ok(composerSource.includes("draft.voice.status === \"failed\""));
    c.uploadDone(photos[1], photoAsset("photo-2"));
    assert.equal(isDraftSendable(c.draft), true);
  });

  it("state: a gallery multi-select never exceeds the cap", () => {
    const c = new Composer();
    c.selectPhotos(9).forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));
    c.selectPhotos(6); // five more than there is room for
    assert.equal(photoCount(c.draft), 10, "never more than ten");
    assert.equal(canAddPhoto(c.draft), false);
  });

  it("the thumbnail carries its own visible upload state", () => {
    const tray = code.slice(code.indexOf("DRAFT TRAY"), code.indexOf("BOTTOM BAR"));
    assert.ok(tray.includes('photo.status === "uploading"'));
    assert.ok(tray.includes("Uploading…"));
    assert.ok(tray.includes('photo.status === "failed"'));
    assert.ok(tray.includes("Failed"));
    // The × and the add-more tile are still there.
    assert.ok(tray.includes('aria-label="Remove photo"'));
    assert.ok(tray.includes('aria-label="Add photos"'));
  });

  it("no photo path registers anything", () => {
    const body = composerSource.slice(
      composerSource.indexOf("async function stagePhotos"),
      composerSource.indexOf("function dropPhoto(")
    );
    assert.equal(body.includes("registerMobileIssue"), false);
    assert.equal(body.includes("confirmSend"), false);
    assert.equal(body.includes("setConfirming"), false);
    assert.equal(body.includes("setDraftText"), false, "the note is never touched");
  });
});

describe("UAT bug — after a successful send, the draft is cleared and shown as sent", () => {
  const composerSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");
  const code = composerSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  /** Exactly what the registered-Issue history renders, and nothing beyond it. */
  const sentBlock = code.slice(code.indexOf("{submittedIssues.map("), code.indexOf("{failure && ("));

  it("TEST A: text-only success clears the composer and shows what was sent", () => {
    const c = new Composer();
    c.type("Testing testing");
    c.send("main");
    c.confirm("ok", "WH-008");

    // The bug: the old text used to stay in the input.
    assert.equal(c.draft.text, "", "the composer input is empty again");
    assert.equal(photoCount(c.draft), 0);
    assert.equal(c.draft.voice, null);
    assert.equal(isDraftValid(c.draft), false, "a fresh, empty draft");

    // And what was submitted is preserved for display.
    assert.equal(c.submittedIssues.at(-1)!.draft.text, "Testing testing");
    assert.equal(c.submittedIssues.at(-1)!.issueId, "WH-008");
    assert.equal(c.registeredId, "WH-008");
  });

  it("TEST B: text + photo success — the snapshot keeps both, the draft keeps neither", () => {
    const c = new Composer();
    c.type("Damaged stock received");
    const id = withPhoto(c, "Outer carton torn");
    c.send("main");
    c.confirm();

    assert.equal(c.draft.text, "");
    assert.equal(photoCount(c.draft), 0, "no unsent thumbnails remain");

    assert.equal(c.submittedIssues.at(-1)!.draft.text, "Damaged stock received");
    assert.equal(c.submittedIssues.at(-1)!.draft.photos.length, 1);
    assert.equal(c.submittedIssues.at(-1)!.draft.photos[0].id, id);
    assert.equal(c.submittedIssues.at(-1)!.draft.photos[0].caption, "Outer carton torn", "the caption went with it");
  });

  it("TEST C: text + photos + voice success — all three are snapshot, none remain", () => {
    const c = new Composer();
    c.type("Damaged stock received");
    withPhoto(c);
    withPhoto(c, "Second one");
    withVoice(c);
    c.send("main");
    c.confirm();

    assert.deepEqual(
      { text: c.draft.text, photos: photoCount(c.draft), voice: c.draft.voice },
      { text: "", photos: 0, voice: null },
      "the active draft is completely empty"
    );
    assert.equal(c.submittedIssues.at(-1)!.draft.photos.length, 2);
    assert.equal(c.submittedIssues.at(-1)!.draft.voice !== null, true);
    assert.equal(c.registerCalls, 1);
  });

  it("TEST D: a FAILURE clears nothing and creates no sent content", () => {
    const c = new Composer();
    c.type("Testing testing");
    withPhoto(c, "cap");
    withVoice(c);

    c.send("main");
    c.confirm("fail");

    assert.equal(c.submittedIssues.length, 0, "nothing may appear as sent");
    assert.equal(c.registeredId, null);
    assert.equal(c.draft.text, "Testing testing", "the note is kept");
    assert.equal(photoCount(c.draft), 1, "the photo is kept");
    assert.equal(c.draft.photos[0].caption, "cap", "the caption is kept");
    assert.equal(c.draft.voice !== null, true, "the recording is kept");
    assert.equal(isDraftSendable(c.draft), true, "and it can be sent again");
  });

  it("TEST E: nothing is cleared before the database confirms", () => {
    const c = new Composer();
    c.type("Testing testing");
    withPhoto(c);

    c.send("main");
    assert.equal(c.draft.text, "Testing testing", "opening the confirmation clears nothing");
    assert.equal(photoCount(c.draft), 1);
    assert.equal(c.submittedIssues.length, 0, "and nothing is sent yet");

    c.back();
    assert.equal(c.draft.text, "Testing testing", "Back clears nothing either");
    assert.equal(photoCount(c.draft), 1);
  });

  it("the clear happens ONLY on the success branch, and the snapshot comes first", () => {
    const body = composerSource.slice(
      composerSource.indexOf("async function confirmSend()"),
      composerSource.indexOf("function startNextIssue")
    );
    const successBranch = body.slice(body.indexOf("if (result.issueId) {"), body.indexOf("} else {"));
    assert.ok(successBranch.includes("setSubmittedIssues((current) => [...current,"));
    assert.ok(successBranch.includes("startNextIssue();"));
    assert.ok(
      successBranch.indexOf("setSubmittedIssues(") < successBranch.indexOf("startNextIssue()"),
      "snapshot BEFORE clearing, or the sent content would be gone"
    );
    // The failure branch clears nothing and records nothing as sent.
    const failureBranch = body.slice(body.indexOf("} else {"), body.indexOf("} catch {"));
    for (const forbidden of ["startNextIssue", "setSubmittedIssues", "setSubmissionId"]) {
      assert.equal(failureBranch.includes(forbidden), false, `a failure must not ${forbidden}`);
    }
    // The draft is emptied in exactly one place: starting the next Issue.
    assert.equal((code.match(/setDraft\(emptyIssueDraft\(\)\)/g) ?? []).length, 1);
    // One call site: the success branch. (The definition has no semicolon.)
    assert.equal((code.match(/startNextIssue\(\);/g) ?? []).length, 1, "called only on success");
  });

  it("the sent content is READ-ONLY — no draft control appears on it", () => {
    assert.ok(sentBlock.includes("issue.draft.text"));
    assert.ok(sentBlock.includes("issue.draft.photos.map"));
    assert.ok(sentBlock.includes("issue.draft.voice"));
    assert.ok(sentBlock.includes("<audio"), "the recording stays playable");
    for (const control of [
      'aria-label="Remove photo"',
      'aria-label="Add photos"',
      "dropPhoto",
      "setPhotoCaption",
      "Retry upload",
      "sendButton",
      "Uploading…",
    ]) {
      assert.equal(sentBlock.includes(control), false, `sent content must not offer ${control}`);
    }
  });

  it("outgoing-bubble styling belongs to sent content and nothing else", () => {
    // The earlier bug was UNSENT content wearing this styling.
    assert.ok(sentBlock.includes("sentBubbleClassName"));
    const tray = code.slice(code.indexOf("DRAFT TRAY"), code.indexOf("BOTTOM BAR"));
    assert.equal(tray.includes("sentBubbleClassName"), false, "the unsent tray must not");
    assert.equal(tray.includes("rounded-br-md"), false);
    // And the tray is hidden once an Issue has been registered.
    assert.ok(tray.includes('screen === "main"'));
  });

  it("the next Issue opens in place — no reload, no router, no navigation", () => {
    for (const escape of [
      "window.location",
      "location.reload",
      "location.assign",
      "router.refresh",
      "router.push",
      "router.replace",
      "useRouter",
      "redirect(",
    ]) {
      assert.equal(composerSource.includes(escape), false, `must not use ${escape}`);
    }
    // Client state only: a new submission id and an empty draft.
    const body = composerSource.slice(
      composerSource.indexOf("function startNextIssue()"),
      composerSource.indexOf("// ── render")
    );
    assert.ok(body.includes("setSubmissionId(crypto.randomUUID());"));
    assert.ok(body.includes("setDraft(emptyIssueDraft());"));
    assert.ok(body.includes("usedSlotsRef.current = new Set();"), "a fresh slot namespace");
    assert.equal(body.includes("setSubmittedIssues"), false, "the history is never cleared");

    const fresh = emptyIssueDraft();
    assert.deepEqual(fresh, { text: "", photos: [], voice: null });
    assert.equal(isDraftValid(fresh), false);
  });

  it("the local previews are NOT released while the sent history still shows them", () => {
    const body = composerSource.slice(
      composerSource.indexOf("async function confirmSend()"),
      composerSource.indexOf("function startNextIssue")
    );
    assert.equal(body.includes("revokeObjectURL"), false, "revoking here would blank the photos");
    const next = composerSource.slice(
      composerSource.indexOf("function startNextIssue()"),
      composerSource.indexOf("// ── render")
    );
    assert.equal(next.includes("revokeObjectURL"), false, "nor when the next Issue opens");
    // They are freed on unmount, and only there.
    assert.ok(composerSource.includes("for (const url of urls) URL.revokeObjectURL(url);"));
  });
});

describe("Composer controls — typing never hides Camera or Mic", () => {
  const composerSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");
  const code = composerSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  /** The composer's control row — from the + button to the end of the row. */
  const row = code.slice(code.indexOf('aria-label="Add media"'), code.indexOf("</div>\n            </>"));

  it("1 & 2: +, Camera and Mic are rendered unconditionally; Send joins them", () => {
    // The bug was a ternary that swapped Camera and Mic OUT for Send. There is
    // no such branch any more: all three are always in the row.
    assert.equal(code.includes("showSend ? ("), false, "no swap remains");
    assert.ok(code.includes("{showSend && sendButton(\"main\")}"), "send is additive");

    for (const control of ['aria-label="Add media"', 'aria-label="Take photo"', 'aria-label="Record voice"']) {
      assert.ok(row.includes(control), `${control} is in the row`);
      assert.equal((code.match(new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1);
    }
    // Each is gated ONLY by its own real limit — never by the text.
    assert.ok(row.includes("disabled={!canAddPhoto(draft)}"), "camera: the photo cap");
    assert.ok(row.includes("disabled={!recordingSupported}"), "mic: device support");
    // Those two, plus send's own transient guard, are the ONLY disable rules in
    // the row — none of them looks at the typed text.
    const disables = row.match(/disabled=\{[^}]*\}/g) ?? [];
    assert.deepEqual(
      [...new Set(disables)].sort(),
      ["disabled={!canAddPhoto(draft)}", "disabled={!recordingSupported}"].sort()
    );
    for (const gate of ["draft.text", "hasMeaningfulText", "typing"]) {
      assert.equal(
        disables.some((rule) => rule.includes(gate)),
        false,
        `no control may be disabled by ${gate}`
      );
    }
  });

  it("2: Send appears as soon as there is something to register", () => {
    assert.ok(composerSource.includes("const showSend = isDraftValid(draft);"));
    const c = new Composer();
    assert.equal(isDraftValid(c.draft), false, "empty: no send");
    c.type("Box damaged");
    assert.equal(isDraftValid(c.draft), true, "text typed: send appears");
  });

  it("3: text survives the Camera action", () => {
    const c = new Composer();
    c.type("Box damaged");
    const id = c.selectPhoto();
    assert.equal(c.draft.text, "Box damaged", "still in the draft");
    c.uploadDone(id, photoAsset("photo-1"));
    c.backToIssue();
    assert.equal(c.draft.text, "Box damaged");
    assert.equal(c.registerCalls, 0, "and nothing was registered");
    assert.equal(c.submittedIssues.length, 0, "nor turned into a sent bubble");
  });

  it("4: text survives the Mic action", () => {
    const c = new Composer();
    c.type("Box damaged");
    const id = c.recordVoice();
    assert.equal(c.draft.text, "Box damaged");
    c.uploadDone(id, voiceAsset());
    c.backToIssue();
    assert.equal(c.draft.text, "Box damaged");
    assert.equal(c.registerCalls, 0);
  });

  it("5: with text AND a photo, the camera stays available up to the cap", () => {
    const c = new Composer();
    c.type("Box damaged");
    withPhoto(c);
    assert.equal(canAddPhoto(c.draft), true, "one photo: still room for more");

    // Fill to the cap.
    c.selectPhotos(9).forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 2}`)));
    assert.equal(photoCount(c.draft), 10);
    assert.equal(canAddPhoto(c.draft), false, "only the CAP closes the camera");
    assert.equal(c.draft.text, "Box damaged", "and the note is untouched throughout");
  });

  it("6: the one-voice rule is unchanged — a second recording replaces the first", () => {
    const c = new Composer();
    c.type("Box damaged");
    const first = c.recordVoice();
    c.uploadDone(first, voiceAsset());
    const firstAsset = c.draft.voice!.asset;

    const second = c.recordVoice();
    c.uploadDone(second, voiceAsset());

    assert.notEqual(c.draft.voice, null);
    assert.equal(c.draft.voice!.id, second, "the newest recording is the draft's voice");
    assert.deepEqual(c.draft.voice!.superseded, [firstAsset], "the first is superseded, not lost");
    assert.equal(draftSummary(c.draft).hasVoice, true);
    assert.equal(c.draft.text, "Box damaged");

    // And exactly one voice item reaches registration.
    c.send("main");
    c.confirm();
    assert.equal(c.kinds().filter((kind) => kind === "voice").length, 1);
  });

  it("all five controls plus the input fit one row", () => {
    // Compact enough for 360px: 4 × 40px buttons, and the input shrinks.
    assert.ok(composerSource.includes("flex h-10 w-10 shrink-0"));
    assert.ok(composerSource.includes("min-w-0 flex-1"), "the input yields, never overflows");
    assert.ok(row.includes('className="h-5 w-5"'), "compact icons");
  });
});

describe("Continuous chat — one Issue after another, no reload", () => {
  const composerSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");
  const pageSource = readFileSync(join(process.cwd(), "app/mobile/page.tsx"), "utf8");
  const code = composerSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

  it("the composer is never disabled by a previous success", () => {
    // The bug: a registered Issue left +, the input, camera and mic greyed out.
    // Nothing in the composer keys off a completed Issue any more.
    for (const gate of [
      "disabled={locked}",
      "disabled={Boolean(registeredId)}",
      "disabled={success}",
      "disabled={submitted}",
      "pointer-events-none",
    ]) {
      assert.equal(code.includes(gate), false, `the composer must not use ${gate}`);
    }
    // The only remaining disable on send is a transient one.
    assert.ok(code.includes("disabled={!sendable}"));
    assert.ok(composerSource.includes("const sendable = isDraftSendable(draft) && !busy;"));
  });

  it("there is no Add Another Issue button left to press", () => {
    assert.equal(code.includes("Add Another Issue"), false, "the composer is already fresh");
    assert.equal(code.includes("startAnotherIssue"), false);
  });

  it("TEST A: first success clears the draft and mints a new submission id", () => {
    const c = new Composer();
    c.type("testin12");
    const before = c.submissionId;

    c.send("main");
    c.confirm("ok", "WH-011");

    assert.equal(c.submittedIssues.length, 1, "kept in the session history");
    assert.equal(c.submittedIssues[0].issueId, "WH-011");
    assert.equal(c.submittedIssues[0].draft.text, "testin12", "what was sent is preserved");

    assert.equal(c.draft.text, "", "the composer is empty");
    assert.equal(photoCount(c.draft), 0);
    assert.equal(c.draft.voice, null);
    assert.notEqual(c.submissionId, before, "a NEW submission id, automatically");
    assert.equal(c.submissionIds.length, 2);
  });

  it("TEST B: the next Issue can be typed immediately, with no click in between", () => {
    const c = new Composer();
    c.type("Issue one");
    c.send("main");
    c.confirm("ok", "WH-011");

    // No "Add Another Issue" step: straight into the next one.
    c.type("Issue two");
    assert.equal(c.draft.text, "Issue two", "the input accepts text at once");
    assert.equal(isDraftSendable(c.draft), true, "and it can be sent");
    assert.equal(c.submittedIssues.length, 1, "the first Issue is still in history");
  });

  it("TEST C & D: three consecutive Issues in one session", () => {
    const c = new Composer();
    const ids: string[] = [];

    c.type("Issue one");
    c.send("main");
    c.confirm("ok", "WH-011");
    ids.push(c.submissionId);

    c.type("Issue two");
    const photo = c.selectPhotos(1)[0];
    c.uploadDone(photo, photoAsset("photo-1"));
    c.send("main");
    c.confirm("ok", "WH-012");
    ids.push(c.submissionId);

    c.type("Issue three");
    c.send("main");
    c.confirm("ok", "WH-013");

    assert.deepEqual(
      c.submittedIssues.map((issue) => issue.issueId),
      ["WH-011", "WH-012", "WH-013"],
      "all three remain visible, in order"
    );
    assert.deepEqual(
      c.submittedIssues.map((issue) => issue.draft.text),
      ["Issue one", "Issue two", "Issue three"]
    );
    assert.equal(c.submittedIssues[1].draft.photos.length, 1, "Issue two kept its photo");
    assert.equal(c.registerCalls, 3, "three separate registrations");

    // Every Issue had its own submission id — never a repeat.
    assert.equal(new Set(c.submissionIds).size, c.submissionIds.length);
    assert.equal(ids[0] !== ids[1], true);

    // And the composer is ready for a fourth.
    assert.equal(c.draft.text, "");
    assert.equal(isDraftValid(c.draft), false);
  });

  it("TEST E: a failure keeps the draft AND the submission id", () => {
    const c = new Composer();
    c.type("Issue one");
    c.send("main");
    c.confirm("ok", "WH-011");

    const idBefore = c.submissionId;
    c.type("Issue two");
    withPhoto(c, "cap");
    c.send("main");
    c.confirm("fail");

    assert.equal(c.submittedIssues.length, 1, "the failed Issue is NOT in history");
    assert.equal(c.submittedIssues[0].issueId, "WH-011", "the earlier success is still there");
    assert.equal(c.draft.text, "Issue two", "the draft is kept for retry");
    assert.equal(photoCount(c.draft), 1);
    assert.equal(c.draft.photos[0].caption, "cap");
    assert.equal(
      c.submissionId,
      idBefore,
      "the SAME submission id, so the retry is idempotent rather than a second Issue"
    );
    assert.ok(c.failure, "and a failure reply is shown");

    // The retry then succeeds and moves on normally.
    c.send("main");
    c.confirm("ok", "WH-012");
    assert.equal(c.submittedIssues.length, 2);
    assert.notEqual(c.submissionId, idBefore, "only now does a new id appear");
  });

  it("TEST F: the success reply is a left-side bubble, not a centred card", () => {
    const historyBlock = code.slice(code.indexOf("{submittedIssues.map("), code.indexOf("{failure && ("));
    assert.ok(historyBlock.includes('className="flex justify-end"'), "sent content on the right");
    assert.ok(historyBlock.includes('className="flex justify-start"'), "the reply on the left");
    assert.ok(historyBlock.includes("replyBubbleClassName"));
    assert.ok(historyBlock.includes("Issue Registered"));
    assert.ok(historyBlock.includes("Issue ID: {issue.issueId}"));
    // The old centred presentation is gone.
    assert.equal(code.includes("mx-auto max-w-[90%] rounded-2xl bg-white px-4 py-3 text-center"), false);
    assert.ok(composerSource.includes("rounded-bl-md"), "an incoming bubble shape");
  });

  it("the failure reply is a left-side bubble too", () => {
    const failureBlock = code.slice(code.indexOf("{failure && ("));
    assert.ok(failureBlock.includes('className="flex justify-start"'));
    assert.ok(failureBlock.includes("Registration Failed"));
    assert.ok(failureBlock.includes("Your issue draft has been kept."));
  });

  it("HEADER: the old subtitle is gone and the helper copy is shown once", () => {
    assert.ok(pageSource.includes("Add Issue"));
    assert.equal(pageSource.includes("New warehouse issue"), false, "removed");
    assert.ok(code.includes("Tell us what happened"));
    assert.ok(code.includes("Add a note, photos or a voice message. Send when you"));
    assert.equal((code.match(/Tell us what happened/g) ?? []).length, 1, "not duplicated");
    assert.equal(pageSource.includes("Tell us what happened"), false, "one location only");
  });

  it("the session history is UI state only — nothing is persisted", () => {
    for (const store of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      assert.equal(composerSource.includes(store), false, `must not persist history in ${store}`);
    }
    assert.ok(composerSource.includes("useState<SentIssue[]>([])"), "plain component state");
  });
});

describe("Photo review — Previous / Next between staged photos", () => {
  const reviewSource = readFileSync(join(process.cwd(), "app/mobile/ReviewScreens.tsx"), "utf8");
  const composerSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");

  it("a single photo gets no arrows and no counter", () => {
    // One photo has nowhere to go, so the whole control set is hidden.
    assert.ok(reviewSource.includes("const canNavigate = total > 1;"));
    assert.ok(reviewSource.includes("{canNavigate && ("), "arrows are behind it");
    assert.ok(reviewSource.includes("{index + 1} / {total}"), "so is the counter");

    const c = new Composer();
    c.selectPhoto();
    assert.equal(photoCount(c.draft), 1);
    assert.equal(adjacentPhotoId(c.draft, c.reviewPhotoId, -1), null, "nothing before it");
    assert.equal(adjacentPhotoId(c.draft, c.reviewPhotoId, 1), null, "nothing after it");
  });

  it("with several photos, Previous and Next walk the strip in order", () => {
    const c = new Composer();
    const ids = c.selectPhotos(4);
    c.openPhoto(ids[0]);

    assert.equal(photoIndex(c.draft, c.reviewPhotoId), 0, "1 / 4");
    c.stepPhoto(1);
    assert.equal(photoIndex(c.draft, c.reviewPhotoId), 1, "2 / 4");
    c.stepPhoto(1);
    c.stepPhoto(1);
    assert.equal(photoIndex(c.draft, c.reviewPhotoId), 3, "4 / 4");
    c.stepPhoto(-1);
    assert.equal(photoIndex(c.draft, c.reviewPhotoId), 2, "back to 3 / 4");

    // The order itself is untouched by any of that.
    assert.deepEqual(c.draft.photos.map((photo) => photo.id), ids);
  });

  it("the ends are dead ends — no wrap-around", () => {
    const c = new Composer();
    const ids = c.selectPhotos(3);

    c.openPhoto(ids[0]);
    assert.equal(adjacentPhotoId(c.draft, ids[0], -1), null, "first: Previous is disabled");
    c.stepPhoto(-1);
    assert.equal(c.reviewPhotoId, ids[0], "and pressing it changes nothing");

    c.openPhoto(ids[2]);
    assert.equal(adjacentPhotoId(c.draft, ids[2], 1), null, "last: Next is disabled");
    c.stepPhoto(1);
    assert.equal(c.reviewPhotoId, ids[2]);

    // Which is exactly what the buttons key their disabled state on.
    assert.ok(reviewSource.includes("disabled={index <= 0}"));
    assert.ok(reviewSource.includes("disabled={index >= total - 1}"));
    assert.ok(reviewSource.includes('aria-label="Previous photo"'));
    assert.ok(reviewSource.includes('aria-label="Next photo"'));
  });

  it("each caption stays with its own photo while navigating", () => {
    const c = new Composer();
    const ids = c.selectPhotos(3);

    c.openPhoto(ids[0]);
    c.caption("First carton");
    c.stepPhoto(1);
    c.caption("Second carton");
    c.stepPhoto(1);
    // The third is left without one.

    c.stepPhoto(-1);
    assert.equal(photoIndex(c.draft, c.reviewPhotoId), 1);
    assert.deepEqual(
      c.draft.photos.map((photo) => photo.caption),
      ["First carton", "Second carton", null],
      "captions never move between photos"
    );
  });

  it("navigating uploads nothing again and preserves every upload state", () => {
    const c = new Composer();
    const ids = c.selectPhotos(3);
    c.uploadDone(ids[0], photoAsset("photo-1"));
    c.uploadFailed(ids[1], "Upload failed.");

    const before = JSON.stringify(c.draft);
    c.openPhoto(ids[0]);
    c.stepPhoto(1);
    c.stepPhoto(1);
    c.stepPhoto(-1);

    assert.equal(JSON.stringify(c.draft), before, "the draft is byte-identical after navigating");
    assert.deepEqual(
      c.draft.photos.map((photo) => photo.status),
      ["uploaded", "failed", "uploading"],
      "each photo keeps the state it had"
    );
    assert.deepEqual(
      c.draft.photos.map((photo) => photo.attemptId),
      JSON.parse(before).photos.map((photo: { attemptId: string }) => photo.attemptId),
      "no new attempt id, so nothing re-uploaded"
    );
  });

  it("navigating registers nothing and touches neither the note nor the voice", () => {
    const c = new Composer();
    c.type("test");
    const ids = c.selectPhotos(3);
    c.recordVoice();
    c.openPhoto(ids[0]);

    c.stepPhoto(1);
    c.stepPhoto(1);

    assert.equal(c.registerCalls, 0, "navigation must not register");
    assert.equal(c.confirming, false, "and must not open the confirmation");
    assert.equal(c.draft.text, "test");
    assert.equal(c.draft.voice !== null, true);

    // The handler only picks a different id to look at.
    const handler = composerSource.slice(
      composerSource.indexOf("onStep={(step) => {"),
      composerSource.indexOf("}}", composerSource.indexOf("onStep={(step) => {"))
    );
    assert.ok(handler.includes("adjacentPhotoId(draft, reviewPhoto.id, step)"));
    assert.ok(handler.includes("setReviewPhotoId(neighbour)"));
    for (const forbidden of ["upload(", "registerMobileIssue", "setDraft(", "setConfirming"]) {
      assert.equal(handler.includes(forbidden), false, `navigation must not ${forbidden}`);
    }
  });

  it("photoIndex and adjacentPhotoId refuse anything not in the draft", () => {
    const c = new Composer();
    c.selectPhotos(2);
    assert.equal(photoIndex(c.draft, "not-a-photo"), -1);
    assert.equal(photoIndex(c.draft, null), -1);
    assert.equal(adjacentPhotoId(c.draft, "not-a-photo", 1), null);
    assert.equal(adjacentPhotoId(c.draft, null, -1), null);
  });
});

describe("Unsent photo strip — thumbnails, ×, and adding more", () => {
  const composerSource = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");
  const code = composerSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
  const tray = code.slice(code.indexOf("DRAFT TRAY"), code.indexOf("BOTTOM BAR"));

  it("TEST 1: text + three photos selected at once", () => {
    const c = new Composer();
    c.type("test");
    const ids = c.selectPhotos(3);
    ids.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));

    assert.equal(c.draft.text, "test", "the note stays in the input");
    assert.equal(photoCount(c.draft), 3, "all three are staged in the SAME draft");
    assert.equal(c.registerCalls, 0, "nothing registered");
    assert.equal(isDraftSendable(c.draft), true, "Send is available");
    assert.equal(c.screen, "main", "a multi-select stays on the draft");
  });

  it("TEST 2: × removes only that photo", () => {
    const c = new Composer();
    c.type("test");
    const ids = c.selectPhotos(3);
    ids.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));
    const voice = c.recordVoice();
    c.uploadDone(voice, voiceAsset());
    c.backToIssue();

    c.removePhoto(ids[1]);

    assert.equal(c.draft.text, "test", "the note is untouched");
    assert.deepEqual(c.draft.photos.map((photo) => photo.id), [ids[0], ids[2]], "only #2 is gone");
    assert.equal(c.draft.voice !== null, true, "the recording is untouched");
    assert.equal(c.registerCalls, 0, "removal registers nothing");
    assert.equal(c.submissionId, c.submissionIdAtStart, "the submission id is unchanged");
  });

  it("TEST 3: photo-only draft is staged and sendable", () => {
    const c = new Composer();
    const ids = c.selectPhotos(2);
    ids.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));

    assert.equal(photoCount(c.draft), 2);
    assert.equal(c.draft.text, "", "no text needed");
    assert.equal(isDraftSendable(c.draft), true);
    assert.equal(c.registerCalls, 0);
  });

  it("TEST 4: the cap holds at ten, however many are picked", () => {
    const c = new Composer();
    const first = c.selectPhotos(9);
    first.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));
    assert.equal(photoCount(c.draft), 9);
    assert.equal(canAddPhoto(c.draft), true);

    // Five more offered; only one may land.
    const more = c.selectPhotos(5);
    more.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${10 + index}`)));

    assert.equal(photoCount(c.draft), 10, "never more than ten active photos");
    assert.equal(canAddPhoto(c.draft), false, "and the add-more tile is then hidden");

    // Removing one frees a place again.
    c.removePhoto(c.draft.photos[0].id);
    assert.equal(photoCount(c.draft), 9);
    assert.equal(canAddPhoto(c.draft), true);
  });

  it("TEST 5: text + photos + voice is one draft with an honest summary", () => {
    const c = new Composer();
    c.type("test");
    const ids = c.selectPhotos(2);
    ids.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));
    const voice = c.recordVoice();
    c.uploadDone(voice, voiceAsset());
    c.backToIssue();

    assert.deepEqual(draftSummary(c.draft), { hasText: true, photos: 2, hasVoice: true });
    c.send("main");
    assert.equal(c.confirming, true);
    assert.equal(c.registerCalls, 0);
    c.confirm();
    assert.deepEqual(c.kinds(), ["text", "image", "image", "voice"]);
  });

  it("TEST 6: a failed send keeps everything the worker can still act on", () => {
    const c = new Composer();
    c.type("test");
    const ids = c.selectPhotos(2);
    ids.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));
    const voice = c.recordVoice();
    c.uploadDone(voice, voiceAsset());
    c.backToIssue();

    c.send("main");
    c.confirm("fail");

    assert.equal(c.registeredId, null, "still unsent");
    assert.equal(c.draft.text, "test");
    assert.equal(photoCount(c.draft), 2);
    assert.equal(c.draft.voice !== null, true);
    assert.equal(canAddPhoto(c.draft), true, "more photos can still be added");

    // And the worker can correct the draft, then send again.
    c.removePhoto(ids[0]);
    assert.equal(photoCount(c.draft), 1);
    c.send("main");
    assert.equal(c.confirming, true, "the retry is confirmed again");
    c.confirm();
    assert.equal(c.registerCalls, 2);
    assert.deepEqual(c.kinds(), ["text", "image", "voice"]);
  });

  it("removing every photo leaves a text-only draft, or an empty one", () => {
    const c = new Composer();
    c.type("test");
    const ids = c.selectPhotos(2);
    ids.forEach((id, index) => c.uploadDone(id, photoAsset(`photo-${index + 1}`)));

    ids.forEach((id) => c.removePhoto(id));
    assert.equal(photoCount(c.draft), 0);
    assert.equal(isDraftValid(c.draft), true, "the note alone is still an Issue");

    c.type("");
    assert.equal(isDraftValid(c.draft), false, "with nothing left, there is nothing to send");
  });

  it("the strip renders a thumbnail, a × and an add-more tile", () => {
    assert.ok(tray.includes('aria-label="Remove photo"'));
    assert.ok(tray.includes("onClick={() => dropPhoto(photo.id)}"));
    assert.ok(tray.includes('aria-label="Add photos"'), "the strip's own + goes straight to Gallery");
    assert.ok(tray.includes("onClick={openGallery}"));
    assert.ok(tray.includes("canAddPhoto(draft) && ("), "hidden at the cap");
    assert.ok(tray.includes("h-16 w-16"), "compact thumbnails");
    assert.ok(tray.includes("object-cover"));
    assert.ok(tray.includes("overflow-x-auto"), "the strip scrolls, the page does not");
    // The main composer's + keeps a distinct role and label.
    assert.ok(code.includes('aria-label="Add media"'));
    assert.equal((code.match(/aria-label="Add photos"/g) ?? []).length, 1);
    assert.equal((code.match(/aria-label="Add media"/g) ?? []).length, 1);
  });

  it("the gallery input accepts a multi-selection", () => {
    const gallery = code.slice(code.indexOf("ref={galleryInputRef}"), code.indexOf("BODY:"));
    assert.ok(gallery.includes("multiple"));
    assert.ok(gallery.includes('accept="image/jpeg"'));
  });

  it("removal drops nothing from Cloudinary — it defers to the existing cleanup", () => {
    const body = composerSource.slice(
      composerSource.indexOf("function dropPhoto("),
      composerSource.indexOf("function stopRecording()")
    );
    assert.ok(body.includes("removedAssetsRef.current.push(...photoAssets(photo))"));
    assert.equal(body.includes("deleteAttachments"), false);
    assert.ok(
      composerSource.includes("draftSupersededAssets(draft, removedAssetsRef.current)"),
      "dropped assets are cleaned up only after a successful registration"
    );
  });

  it("no per-item Edit/Retake/Reselect menu came back with it", () => {
    for (const removed of ["Edit Caption", "Retake", "Reselect", "Record Again", "onContextMenu", "onPointerDown"]) {
      assert.equal(code.includes(removed), false, `"${removed}" must stay removed`);
    }
  });
});

describe("Unified send — the screen never decides the payload", () => {
  it("TEST A: text → photo → Send FROM THE PHOTO SCREEN", () => {
    const c = new Composer();
    c.type("Box damaged");
    const id = c.selectPhoto();

    // Staged immediately: no Add Photo step, and the note is untouched.
    assert.equal(c.screen, "photo");
    assert.equal(c.draft.text, "Box damaged");
    assert.equal(photoCount(c.draft), 1);
    assert.equal(c.registerCalls, 0);

    c.uploadDone(id, photoAsset("photo-1"));
    c.send("photo");
    assert.equal(c.confirming, true, "the photo screen must show the confirmation");
    assert.equal(c.registerCalls, 0, "the photo screen must not register");

    c.back();
    assert.equal(c.screen, "photo", "Back returns to the photo review, not an empty screen");
    assert.equal(c.draft.text, "Box damaged", "the note is still there");
    assert.equal(photoCount(c.draft), 1, "the photo is still there");

    c.send("photo");
    c.confirm();
    assert.equal(c.registerCalls, 1);
    assert.deepEqual(c.kinds(), ["text", "image"], "the WHOLE draft, not just the photo");
  });

  it("TEST B: photo only, sent from the photo screen", () => {
    const c = new Composer();
    const id = c.selectPhoto();
    c.uploadDone(id, photoAsset("photo-1"));
    c.send("photo");
    assert.equal(c.confirming, true);
    assert.equal(c.registerCalls, 0);
    c.confirm();
    assert.deepEqual(c.kinds(), ["image"]);
  });

  it("TEST C: text + photo + caption, sent from the photo screen", () => {
    const c = new Composer();
    c.type("Box damaged");
    const id = c.selectPhoto();
    c.caption("Outer carton torn");
    c.uploadDone(id, photoAsset("photo-1"));
    c.send("photo");
    c.confirm();

    assert.equal(c.description(), "Box damaged\nCaption: Outer carton torn");
  });

  it("TEST D: text → voice → Send FROM THE VOICE SCREEN", () => {
    const c = new Composer();
    const spoken = "Machine making unusual noise";
    c.type(spoken);
    const id = c.recordVoice();

    assert.equal(c.screen, "voice");
    assert.equal(c.draft.text, spoken, "the note survives the recording");
    assert.equal(c.draft.voice !== null, true);

    c.uploadDone(id, voiceAsset());
    c.send("voice");
    assert.equal(c.confirming, true);
    assert.equal(c.registerCalls, 0);

    c.back();
    assert.equal(c.screen, "voice", "Back returns to the voice review");
    assert.equal(c.draft.text, spoken);

    c.send("voice");
    c.confirm();
    assert.deepEqual(c.kinds(), ["text", "voice"], "never voice-only when text exists");
  });

  it("TEST E: voice only, sent from the voice screen", () => {
    const c = new Composer();
    const id = c.recordVoice();
    c.uploadDone(id, voiceAsset());
    c.send("voice");
    assert.equal(c.confirming, true);
    c.confirm();
    assert.deepEqual(c.kinds(), ["voice"]);
  });

  it("TEST F: text + photo + voice, sent from the VOICE screen", () => {
    const c = new Composer();
    c.type("Received damaged stock");
    withPhoto(c, "Outer carton torn");
    const voice = c.recordVoice();
    c.uploadDone(voice, voiceAsset());

    assert.deepEqual(draftSummary(c.draft), { hasText: true, photos: 1, hasVoice: true });

    c.send("voice");
    assert.equal(c.confirming, true);
    assert.equal(c.registerCalls, 0);
    c.confirm();

    assert.equal(c.registerCalls, 1, "exactly ONE Issue");
    assert.deepEqual(c.kinds(), ["text", "image", "voice"]);
    assert.equal(c.description(), "Received damaged stock\nCaption: Outer carton torn");
  });

  it("TEST G: two photos staged across two visits, sent from the second review", () => {
    const c = new Composer();
    withPhoto(c, "first");
    const second = c.selectPhoto();
    c.uploadDone(second, photoAsset("photo-2"));

    assert.equal(photoCount(c.draft), 2, "the first photo survived Back and a second selection");
    assert.deepEqual(draftSummary(c.draft), { hasText: false, photos: 2, hasVoice: false });

    c.send("photo");
    c.confirm();
    assert.deepEqual(c.kinds(), ["image", "image"], "both photos, not just the one on screen");
    assert.equal(c.registerCalls, 1);
  });

  it("TEST H: Back always returns to the screen the send came from", () => {
    const cases: Array<[Screen, (c: Composer) => void]> = [
      ["main", (c) => c.type(NOTE)],
      [
        "photo",
        (c) => {
          const id = c.selectPhoto();
          c.uploadDone(id, photoAsset("photo-1"));
        },
      ],
      [
        "voice",
        (c) => {
          const id = c.recordVoice();
          c.uploadDone(id, voiceAsset());
        },
      ],
    ];

    for (const [origin, build] of cases) {
      const c = new Composer();
      build(c);
      if (origin === "main") c.backToIssue();
      const before = JSON.stringify(c.draft);

      c.send(origin);
      assert.equal(c.confirming, true, `${origin} send opens the confirmation`);
      c.back();
      assert.equal(c.screen, origin, `Back returns to ${origin}`);
      assert.equal(JSON.stringify(c.draft), before, `${origin}: the draft is untouched`);
      assert.equal(c.registerCalls, 0);
    }
  });

  it("every screen's send is the same request against the same draft", () => {
    // The three origins differ only in where Back lands — never in the payload.
    const payloads = (["main", "photo", "voice"] as const).map((origin) => {
      const c = new Composer();
      c.type(NOTE);
      withPhoto(c, "cap");
      const v = c.recordVoice();
      c.uploadDone(v, voiceAsset());
      c.send(origin);
      c.confirm();
      return { origin, kinds: c.kinds(), calls: c.registerCalls };
    });

    for (const result of payloads) {
      assert.deepEqual(result.kinds, ["text", "image", "voice"], `${result.origin} payload`);
      assert.equal(result.calls, 1, `${result.origin} registers exactly once`);
    }
  });
});

describe("Issue Draft — the confirmation summary claims only what exists", () => {
  it("reports text, photo count and voice exactly", () => {
    const cases: Array<[string, (c: Composer) => void, { hasText: boolean; photos: number; hasVoice: boolean }]> = [
      ["text only", (c) => c.type(NOTE), { hasText: true, photos: 0, hasVoice: false }],
      ["photo only", (c) => void withPhoto(c), { hasText: false, photos: 1, hasVoice: false }],
      [
        "three photos",
        (c) => {
          withPhoto(c);
          withPhoto(c);
          withPhoto(c);
        },
        { hasText: false, photos: 3, hasVoice: false },
      ],
      ["voice only", (c) => void withVoice(c), { hasText: false, photos: 0, hasVoice: true }],
      [
        "photo + voice",
        (c) => {
          withPhoto(c);
          withPhoto(c);
          withVoice(c);
        },
        { hasText: false, photos: 2, hasVoice: true },
      ],
      [
        "text + photos + voice",
        (c) => {
          c.type(NOTE);
          withPhoto(c);
          withPhoto(c);
          withVoice(c);
        },
        { hasText: true, photos: 2, hasVoice: true },
      ],
    ];

    for (const [name, build, expected] of cases) {
      const c = new Composer();
      build(c);
      assert.deepEqual(draftSummary(c.draft), expected, name);
    }
  });

  it("whitespace-only text is not reported as text", () => {
    const c = new Composer();
    c.type("   ");
    withPhoto(c);
    assert.deepEqual(draftSummary(c.draft), { hasText: false, photos: 1, hasVoice: false });
  });
});
