import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MEDIA_CONSENT_KINDS,
  MEDIA_DENIED_MESSAGE,
  isMediaConsentKind,
  mediaConsentPrompt,
  type MediaConsentKind,
} from "../lib/mobile/mediaConsent";

// WAREHOUSE MOBILE LITE — the app's own media consent prompt.
//
// The copy and the kinds are pure data, so they are EXECUTED here. The wiring
// lives in a Client Component that cannot be imported under `tsx --test`, so
// that half is read as source — and the assertions are written against the
// property that matters: which function a button calls, and whether any device
// call can be reached without passing through the sheet.

const composer = readFileSync(join(process.cwd(), "app/mobile/MobileComposer.tsx"), "utf8");
const page = readFileSync(join(process.cwd(), "app/mobile/page.tsx"), "utf8");

/** Source with comment lines removed — the file documents what it must not do,
 *  so "must not appear" assertions have to look at code. */
function codeOnly(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const composerCode = codeOnly(composer);

/** Every onClick handler name in the composer, with its position. */
function handlersFor(name: string): number[] {
  return [...composerCode.matchAll(new RegExp(`onClick=\\{${name}\\}`, "g"))].map((m) => m.index!);
}

// ---------------------------------------------------------------------------
// The prompts themselves
// ---------------------------------------------------------------------------

describe("the consent prompts say exactly what was approved", () => {
  it("covers three kinds and no more", () => {
    assert.deepEqual([...MEDIA_CONSENT_KINDS], ["gallery", "camera", "voice"]);
  });

  it("gallery", () => {
    const prompt = mediaConsentPrompt("gallery");
    assert.equal(prompt.title, "Choose Photos?");
    assert.equal(
      prompt.body,
      "You'll choose which photos to add to this Issue. Only the photos you select will be used."
    );
    assert.equal(prompt.confirmLabel, "Choose Photos");
    assert.equal(prompt.cancelLabel, "Cancel");
  });

  it("camera", () => {
    const prompt = mediaConsentPrompt("camera");
    assert.equal(prompt.title, "Allow Camera Access?");
    assert.equal(prompt.body, "Your camera will only be used to take photos for this Issue.");
    assert.equal(prompt.confirmLabel, "Allow Camera");
    assert.equal(prompt.cancelLabel, "Cancel");
  });

  it("voice", () => {
    const prompt = mediaConsentPrompt("voice");
    assert.equal(prompt.title, "Allow Microphone Access?");
    assert.equal(
      prompt.body,
      "Your microphone will only be used while recording a voice message for this Issue."
    );
    assert.equal(prompt.confirmLabel, "Allow Microphone");
    assert.equal(prompt.cancelLabel, "Cancel");
  });

  it("every kind offers a way out, in the same place", () => {
    for (const kind of MEDIA_CONSENT_KINDS) {
      assert.equal(mediaConsentPrompt(kind).cancelLabel, "Cancel");
    }
  });

  it("refuses a kind that does not exist", () => {
    for (const value of ["location", "contacts", "notifications", "", null, 7, {}]) {
      assert.equal(isMediaConsentKind(value), false);
    }
    for (const kind of MEDIA_CONSENT_KINDS) {
      assert.equal(isMediaConsentKind(kind), true);
    }
  });

  it("mentions no permission Mobile Lite must never ask for", () => {
    const allCopy = MEDIA_CONSENT_KINDS.map((kind) => JSON.stringify(mediaConsentPrompt(kind)))
      .join(" ")
      .toLowerCase();
    for (const forbidden of ["location", "contact", "notification", "bluetooth", "file system", "filesystem"]) {
      assert.equal(allCopy.includes(forbidden), false, `consent copy must not mention ${forbidden}`);
    }
  });

  it("carries the approved denial messages", () => {
    assert.equal(MEDIA_DENIED_MESSAGE.camera, "Camera access was not allowed.");
    assert.equal(MEDIA_DENIED_MESSAGE.voice, "Microphone access was not allowed.");
  });
});

// ---------------------------------------------------------------------------
// Ask every time
// ---------------------------------------------------------------------------

describe("consent is asked EVERY time — nothing remembers it", () => {
  it("the module persists nothing", () => {
    const module = readFileSync(join(process.cwd(), "lib/mobile/mediaConsent.ts"), "utf8");
    for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "indexedDB"]) {
      assert.equal(codeOnly(module).includes(forbidden), false, `must not use ${forbidden}`);
    }
  });

  it("the composer stores consent in transient state only", () => {
    assert.ok(composerCode.includes("const [consent, setConsent] = useState<MediaConsentKind | null>(null)"));
    for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "consentGranted", "alreadyAllowed"]) {
      assert.equal(composerCode.includes(forbidden), false, `must not persist consent via ${forbidden}`);
    }
  });

  it("offers no way to stop being asked", () => {
    for (const forbidden of ["Don't ask again", "Do not ask again", "dontAskAgain", "rememberConsent"]) {
      assert.equal(composer.includes(forbidden), false, `must not offer "${forbidden}"`);
    }
  });

  it("clears the consent before the device is touched, so the next tap asks again", () => {
    const accept = composerCode.slice(
      composerCode.indexOf("function acceptConsent()"),
      composerCode.indexOf("function stopMediaTracks()")
    );
    assert.ok(accept.includes("setConsent(null)"));
    // The reset must come BEFORE the media call, not after it.
    assert.ok(accept.indexOf("setConsent(null)") < accept.indexOf("galleryInputRef.current?.click()"));
    assert.ok(accept.indexOf("setConsent(null)") < accept.indexOf("cameraInputRef.current?.click()"));
    assert.ok(accept.indexOf("setConsent(null)") < accept.indexOf("startRecording()"));
  });
});

// ---------------------------------------------------------------------------
// Every entry point goes through the sheet
// ---------------------------------------------------------------------------

describe("no media entry point can bypass the sheet", () => {
  it("the three openers only ASK", () => {
    for (const [opener, kind] of [
      ["openGallery", "gallery"],
      ["openCamera", "camera"],
      ["openVoice", "voice"],
    ] as Array<[string, MediaConsentKind]>) {
      const body = composerCode.slice(
        composerCode.indexOf(`function ${opener}()`),
        composerCode.indexOf(`function ${opener}()`) + 120
      );
      assert.ok(body.includes(`requestConsent("${kind}")`), `${opener} must request consent`);
      // It must not open anything itself.
      for (const device of ["click()", "getUserMedia"]) {
        assert.equal(body.includes(device), false, `${opener} must not call ${device}`);
      }
    }
  });

  it("every media BUTTON calls an opener, never a device directly", () => {
    // Both Gallery buttons (menu + photo strip), both Camera buttons, and both
    // Mic buttons.
    assert.equal(handlersFor("openGallery").length, 2, "two Gallery entry points");
    assert.equal(handlersFor("openCamera").length, 2, "two Camera entry points");
    assert.equal(handlersFor("openVoice").length, 2, "two Microphone entry points");
    // No button may still call the recorder directly.
    assert.equal(
      composerCode.includes("onClick={() => void startRecording()}"),
      false,
      "no button may start recording without consent"
    );
  });

  it("the ONLY device calls sit inside acceptConsent and startRecording", () => {
    // Gallery and camera: exactly one click() each, both in acceptConsent.
    const accept = composerCode.slice(
      composerCode.indexOf("function acceptConsent()"),
      composerCode.indexOf("function stopMediaTracks()")
    );
    assert.equal((composerCode.match(/galleryInputRef\.current\?\.click\(\)/g) ?? []).length, 1);
    assert.equal((composerCode.match(/cameraInputRef\.current\?\.click\(\)/g) ?? []).length, 1);
    assert.ok(accept.includes("galleryInputRef.current?.click()"));
    assert.ok(accept.includes("cameraInputRef.current?.click()"));

    // Microphone: exactly one getUserMedia, inside startRecording, which is
    // itself only reachable from acceptConsent.
    const getUserMedia = [...composerCode.matchAll(/navigator\.mediaDevices\.getUserMedia/g)];
    assert.equal(getUserMedia.length, 1, "exactly one getUserMedia call");
    const startRecording = composerCode.indexOf("async function startRecording()");
    assert.ok(getUserMedia[0].index! > startRecording, "it must live in startRecording");
    assert.equal(
      (composerCode.match(/startRecording\(\)/g) ?? []).length,
      2,
      "startRecording is defined once and called once (from acceptConsent)"
    );
  });

  it("Cancel opens nothing and touches no draft", () => {
    const decline = composerCode.slice(
      composerCode.indexOf("function declineConsent()"),
      composerCode.indexOf("function acceptConsent()")
    );
    assert.ok(decline.includes("setConsent(null)"));
    assert.ok(decline.includes("stopMediaTracks()"));
    for (const forbidden of ["click()", "getUserMedia", "setDraft", "setSubmissionId", "upload("]) {
      assert.equal(decline.includes(forbidden), false, `Cancel must not call ${forbidden}`);
    }
  });

  it("Cancel cannot register an Issue", () => {
    const decline = composerCode.slice(
      composerCode.indexOf("function declineConsent()"),
      composerCode.indexOf("function acceptConsent()")
    );
    const accept = composerCode.slice(
      composerCode.indexOf("function acceptConsent()"),
      composerCode.indexOf("function stopMediaTracks()")
    );
    for (const forbidden of ["registerMobileIssue", "requestMobileUploadTicket", "confirmSend"]) {
      assert.equal(decline.includes(forbidden), false, `Cancel must not call ${forbidden}`);
      assert.equal(accept.includes(forbidden), false, `Allow must not call ${forbidden}`);
    }
  });

  it("the menu closes while the sheet is open, so a second tap cannot slip past", () => {
    assert.ok(composerCode.includes("{menuOpen && !confirming && !consent && screen === \"main\" && ("));
    const request = composerCode.slice(
      composerCode.indexOf("function requestConsent("),
      composerCode.indexOf("function declineConsent()")
    );
    assert.ok(request.includes("setMenuOpen(false)"));
    assert.ok(request.includes("setConsent(kind)"));
  });
});

// ---------------------------------------------------------------------------
// The draft survives
// ---------------------------------------------------------------------------

describe("the draft is untouched by asking, allowing or cancelling", () => {
  it("no consent handler writes draft state", () => {
    const region = composerCode.slice(
      composerCode.indexOf("function requestConsent("),
      composerCode.indexOf("function openCamera()")
    );
    for (const forbidden of ["setDraft", "setSubmissionId", "setSubmittedIssues", "emptyIssueDraft"]) {
      assert.equal(region.includes(forbidden), false, `consent handling must not call ${forbidden}`);
    }
  });

  it("the sheet renders alongside the draft rather than replacing the screen", () => {
    // It is rendered in the bottom-bar slot, so the timeline above it — text,
    // photo thumbnails, voice — stays on screen while the question is asked.
    assert.ok(composerCode.includes("{consentSheet ? ("));
    assert.ok(composerCode.includes("consentSheet"));
  });
});

// ---------------------------------------------------------------------------
// Nothing happens on load
// ---------------------------------------------------------------------------

describe("opening /mobile requests no media at all", () => {
  it("the page renders no media call", () => {
    const pageCode = codeOnly(page);
    for (const forbidden of ["getUserMedia", "MediaRecorder", "click()", "capture="]) {
      assert.equal(pageCode.includes(forbidden), false, `the page must not reference ${forbidden}`);
    }
  });

  it("no effect opens a device on mount", () => {
    // The only mount effects are a capability probe (which reads flags, never
    // opens anything) and a cleanup registration.
    const effects = [...composerCode.matchAll(/useEffect\(/g)].map((m) => m.index!);
    for (const start of effects) {
      const body = composerCode.slice(start, start + 400);
      assert.equal(
        body.includes("navigator.mediaDevices.getUserMedia("),
        false,
        "no effect may open the microphone on mount"
      );
      assert.equal(body.includes(".click()"), false, "no effect may open a picker on mount");
    }
  });

  it("the capability probe only reads feature flags", () => {
    assert.ok(
      composerCode.includes(
        'typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)'
      )
    );
  });

  it("requests no permission outside the three media kinds", () => {
    for (const forbidden of [
      "geolocation",
      "Notification",
      "requestPermission",
      "bluetooth",
      "showOpenFilePicker",
      "navigator.contacts",
    ]) {
      assert.equal(composerCode.includes(forbidden), false, `must not use ${forbidden}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Releasing the device
// ---------------------------------------------------------------------------

describe("the microphone is never left open", () => {
  it("one helper stops the tracks, used everywhere", () => {
    assert.ok(composerCode.includes("function stopMediaTracks()"));
    assert.ok(composerCode.includes("streamRef.current?.getTracks().forEach((track) => track.stop())"));
    // Cancel, end-of-recording and failure all release it.
    const uses = (composerCode.match(/stopMediaTracks\(\)/g) ?? []).length;
    assert.ok(uses >= 4, `expected the release helper to be defined and used, saw ${uses}`);
  });

  it("a device refusal releases the stream and keeps the draft", () => {
    const catchBlock = composerCode.slice(
      composerCode.indexOf("} catch {", composerCode.indexOf("async function startRecording()")),
      composerCode.indexOf("async function startRecording()") + 2200
    );
    assert.ok(catchBlock.includes("stopMediaTracks()"));
    assert.ok(catchBlock.includes("MEDIA_DENIED_MESSAGE.voice"));
    assert.equal(catchBlock.includes("setDraft"), false, "a refusal must not clear the draft");
    // No automatic retry.
    assert.equal(catchBlock.includes("startRecording()"), false, "must not retry automatically");
  });

  it("unmount — which is what logout causes — stops the tracks", () => {
    // Logout navigates away from /mobile, unmounting the composer; the cleanup
    // effect runs and releases anything still open.
    const cleanup = composerCode.slice(
      composerCode.indexOf("const stream = streamRef.current"),
      composerCode.indexOf("const stream = streamRef.current") + 400
    );
    assert.ok(cleanup.includes("stream?.getTracks().forEach((track) => track.stop())"));
    assert.ok(cleanup.includes("clearInterval"));
  });
});
