import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MOBILE_MAX_PHOTO_BYTES,
  MOBILE_MAX_RECORDING_SECONDS,
  MOBILE_MAX_VOICE_BYTES,
  PHOTO_FORMAT_ERROR,
  formatDuration,
  validateMobilePhoto,
  validateMobileVoice,
} from "../lib/mobile/mobileMedia";
import {
  initialSlots,
  isRegisterReady,
  isSlotUploaded,
  retryUpload,
  selectMedia,
  supersededAssets,
  uploadFailed,
  uploadStarted,
  uploadSucceeded,
  type UploadedAsset,
} from "../lib/mobile/mobileSlots";
import { cloudinaryUploadUrl, uploadToCloudinary, MobileUploadError } from "../lib/mobile/mobileUpload";
import { buildMobilePublicId, isValidAttemptId } from "../lib/mobile/mobileAccess";
import {
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  IMAGE_EXTENSIONS,
} from "../lib/access/attachments";

// Warehouse Mobile Lite — Stage 4: capture, validation, retry vs replace, and
// the direct-upload boundary.
//
// NO REAL CLOUDINARY ASSET IS EVER CREATED HERE. Every upload test drives a
// fake fetch; there is no network call and no production account involved.

const SUBMISSION = "0b6a3d2e-1c4f-4a7b-9e2d-8f5c1a3b7d90";
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBM_HEAD = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
const MP4_HEAD = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]); // ....ftyp
const HEIC_HEAD = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]); // ftyp too
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function asset(publicId: string): UploadedAsset {
  return {
    publicId,
    secureUrl: `https://res.cloudinary.com/demo/${publicId}`,
    bytes: 1234,
    format: "jpg",
    resourceType: "image",
  };
}

describe("Stage 4 — photo validation", () => {
  it("accepts a JPEG within the mobile cap", () => {
    assert.deepEqual(validateMobilePhoto({ size: 2_000_000, head: JPEG_HEAD }), { ok: true });
  });

  it("rejects a photo larger than 5 MB", () => {
    const result = validateMobilePhoto({ size: MOBILE_MAX_PHOTO_BYTES + 1, head: JPEG_HEAD });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /larger than 5 MB/);
  });

  it("rejects an empty photo", () => {
    assert.equal(validateMobilePhoto({ size: 0, head: JPEG_HEAD }).ok, false);
  });

  it("rejects a non-JPEG by its BYTES, not its name", () => {
    for (const head of [PNG_HEAD, HEIC_HEAD, WEBM_HEAD]) {
      const result = validateMobilePhoto({ size: 1000, head });
      assert.equal(result.ok, false);
      assert.equal(result.ok === false ? result.error : "", PHOTO_FORMAT_ERROR);
    }
  });

  it("gives HEIC an actionable message rather than a generic refusal", () => {
    assert.match(PHOTO_FORMAT_ERROR, /Most Compatible/);
  });
});

describe("Stage 4 — voice validation", () => {
  it("accepts both browser recording containers", () => {
    assert.deepEqual(validateMobileVoice({ size: 400_000, head: WEBM_HEAD }), { ok: true });
    assert.deepEqual(validateMobileVoice({ size: 400_000, head: MP4_HEAD }), { ok: true });
  });

  it("rejects a recording larger than 5 MB", () => {
    const result = validateMobileVoice({ size: MOBILE_MAX_VOICE_BYTES + 1, head: WEBM_HEAD });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /larger than 5 MB/);
  });

  it("rejects an unsupported audio container", () => {
    assert.equal(validateMobileVoice({ size: 1000, head: PNG_HEAD }).ok, false);
  });

  it("rejects an empty recording", () => {
    assert.equal(validateMobileVoice({ size: 0, head: WEBM_HEAD }).ok, false);
  });
});

describe("Stage 4 — mobile caps are TIGHTER than the desktop, which is unchanged", () => {
  it("mobile photo cap is below the shared image cap", () => {
    assert.ok(MOBILE_MAX_PHOTO_BYTES < MAX_IMAGE_BYTES);
  });

  it("mobile voice cap is below the shared audio cap", () => {
    assert.ok(MOBILE_MAX_VOICE_BYTES < MAX_AUDIO_BYTES);
  });

  it("the shared desktop validator still accepts JPEG only", () => {
    assert.deepEqual([...IMAGE_EXTENSIONS], [".jpg", ".jpeg"]);
    assert.equal(MAX_IMAGE_BYTES, 10 * 1024 * 1024);
    assert.equal(MAX_AUDIO_BYTES, 25 * 1024 * 1024);
  });

  it("the recording limit is 3 minutes", () => {
    assert.equal(MOBILE_MAX_RECORDING_SECONDS, 180);
    assert.equal(formatDuration(MOBILE_MAX_RECORDING_SECONDS), "3:00");
    assert.equal(formatDuration(65), "1:05");
  });
});

describe("Stage 4 — RETRY reuses the attempt, REPLACE mints a new one", () => {
  it("a failed upload keeps its attemptId so a retry reuses the same public_id", () => {
    const attempt = crypto.randomUUID();
    let slot = selectMedia(initialSlots().photo1, attempt);
    slot = uploadStarted(slot);
    slot = uploadFailed(slot, "Upload failed.");
    assert.equal(slot.status, "failed");
    assert.equal(slot.attemptId, attempt);

    const retried = retryUpload(slot);
    assert.equal(retried.status, "ready");
    assert.equal(retried.attemptId, attempt, "a retry must NOT change the attempt id");
    assert.equal(
      buildMobilePublicId(SUBMISSION, "photo1", retried.attemptId!),
      buildMobilePublicId(SUBMISSION, "photo1", attempt)
    );
  });

  it("retrying anything that is not failed does nothing", () => {
    const attempt = crypto.randomUUID();
    const uploaded = uploadSucceeded(selectMedia(initialSlots().voice, attempt), asset("p"));
    assert.deepEqual(retryUpload(uploaded), uploaded);
  });

  it("re-recording voice after success mints a NEW attempt and a NEW public_id", () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    let slot = uploadSucceeded(selectMedia(initialSlots().voice, first), asset("first"));
    slot = selectMedia(slot, second);

    assert.notEqual(second, first);
    assert.notEqual(
      buildMobilePublicId(SUBMISSION, "voice", second),
      buildMobilePublicId(SUBMISSION, "voice", first)
    );
    assert.equal(slot.status, "ready", "a replacement is not uploaded until it lands");
  });

  it("replacing Photo 1 supersedes the previous asset rather than losing it", () => {
    const first = asset("issue-tracker/mobile/x/photo1/one");
    let slot = uploadSucceeded(selectMedia(initialSlots().photo1, crypto.randomUUID()), first);
    slot = selectMedia(slot, crypto.randomUUID());

    assert.deepEqual(slot.superseded, [first]);
    assert.equal(slot.asset, null);
  });

  it("replacing Photo 2 behaves identically", () => {
    const first = asset("issue-tracker/mobile/x/photo2/one");
    let slot = uploadSucceeded(selectMedia(initialSlots().photo2, crypto.randomUUID()), first);
    slot = selectMedia(slot, crypto.randomUUID());
    assert.deepEqual(slot.superseded, [first]);
  });

  it("collects every superseded asset across all slots", () => {
    const slots = initialSlots();
    const a = asset("a");
    const b = asset("b");
    slots.voice = selectMedia(uploadSucceeded(selectMedia(slots.voice, crypto.randomUUID()), a), crypto.randomUUID());
    slots.photo1 = selectMedia(uploadSucceeded(selectMedia(slots.photo1, crypto.randomUUID()), b), crypto.randomUUID());
    assert.deepEqual(supersededAssets(slots), [a, b]);
  });
});

describe("Stage 4 — REGISTER readiness", () => {
  function uploadedSlot() {
    return uploadSucceeded(selectMedia(initialSlots().voice, crypto.randomUUID()), asset("x"));
  }

  it("is not ready while any slot is empty", () => {
    assert.equal(isRegisterReady(initialSlots()), false);
  });

  it("is not ready with only two of three uploaded", () => {
    const slots = initialSlots();
    slots.voice = uploadedSlot();
    slots.photo1 = uploadedSlot();
    assert.equal(isRegisterReady(slots), false);
  });

  it("is not ready when a slot failed", () => {
    const slots = initialSlots();
    slots.voice = uploadedSlot();
    slots.photo1 = uploadedSlot();
    slots.photo2 = uploadFailed(selectMedia(initialSlots().photo2, crypto.randomUUID()), "boom");
    assert.equal(isRegisterReady(slots), false);
    assert.equal(isSlotUploaded(slots.photo2), false);
  });

  it("is not ready while a replacement is mid-flight", () => {
    const slots = initialSlots();
    slots.voice = uploadedSlot();
    slots.photo1 = uploadedSlot();
    slots.photo2 = uploadedSlot();
    assert.equal(isRegisterReady(slots), true);

    slots.photo2 = selectMedia(slots.photo2, crypto.randomUUID());
    assert.equal(isRegisterReady(slots), false, "a replacement must un-ready the form");
  });

  it("is ready only when all three have an active uploaded asset", () => {
    const slots = initialSlots();
    slots.voice = uploadedSlot();
    slots.photo1 = uploadedSlot();
    slots.photo2 = uploadedSlot();
    assert.equal(isRegisterReady(slots), true);
  });
});

describe("Stage 4 — direct upload boundary (fake fetch, no real assets)", () => {
  const ticket = {
    cloudName: "demo-cloud",
    apiKey: "public-api-key",
    timestamp: 1_760_000_000,
    signature: "a".repeat(40),
    publicId: buildMobilePublicId(SUBMISSION, "photo1", crypto.randomUUID()),
    resourceType: "image" as const,
  };

  it("posts DIRECTLY to Cloudinary, not to this application", async () => {
    let calledUrl = "";
    await uploadToCloudinary(ticket, new Blob(["x"]), "photo.jpg", async (url) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ secure_url: "https://res.cloudinary.com/x", public_id: ticket.publicId, bytes: 1, format: "jpg" }),
      };
    });
    assert.equal(calledUrl, `https://api.cloudinary.com/v1_1/demo-cloud/image/upload`);
    assert.equal(calledUrl, cloudinaryUploadUrl(ticket));
    assert.ok(!calledUrl.includes("localhost"));
    assert.ok(!calledUrl.startsWith("/"), "bytes must not go to a Server Action or Route Handler");
  });

  it("sends the signed parameters exactly as signed, including overwrite=false", async () => {
    let sent: FormData | null = null;
    await uploadToCloudinary(ticket, new Blob(["x"]), "photo.jpg", async (_url, init) => {
      sent = init.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ secure_url: "https://res.cloudinary.com/x", public_id: ticket.publicId }),
      };
    });
    assert.ok(sent);
    assert.equal(sent!.get("public_id"), ticket.publicId);
    assert.equal(sent!.get("overwrite"), "false");
    assert.equal(sent!.get("timestamp"), String(ticket.timestamp));
    assert.equal(sent!.get("signature"), ticket.signature);
    assert.equal(sent!.get("api_key"), ticket.apiKey);
  });

  it("never sends an api secret", async () => {
    let sent: FormData | null = null;
    await uploadToCloudinary(ticket, new Blob(["x"]), "photo.jpg", async (_url, init) => {
      sent = init.body;
      return { ok: true, status: 200, json: async () => ({ secure_url: "https://x", public_id: "p" }) };
    });
    for (const key of [...sent!.keys()]) {
      assert.equal(key.includes("secret"), false, `form must not carry "${key}"`);
    }
  });

  it("records the asset from Cloudinary's response, not from the local file", async () => {
    const result = await uploadToCloudinary(ticket, new Blob(["x"]), "photo.jpg", async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        secure_url: "https://res.cloudinary.com/demo/real",
        public_id: ticket.publicId,
        bytes: 98_765,
        format: "jpg",
      }),
    }));
    assert.equal(result.secureUrl, "https://res.cloudinary.com/demo/real");
    assert.equal(result.bytes, 98_765);
    assert.equal(result.resourceType, "image");
  });

  it("throws a worker-safe error when Cloudinary rejects the upload", async () => {
    await assert.rejects(
      () =>
        uploadToCloudinary(ticket, new Blob(["x"]), "photo.jpg", async () => ({
          ok: false,
          status: 401,
          json: async () => ({ error: { message: "Invalid signature" } }),
        })),
      (error: unknown) => {
        assert.ok(error instanceof MobileUploadError);
        // The provider's message is not leaked to a warehouse worker.
        assert.equal((error as Error).message.includes("signature"), false);
        return true;
      }
    );
  });

  it("throws when the network drops", async () => {
    await assert.rejects(
      () =>
        uploadToCloudinary(ticket, new Blob(["x"]), "photo.jpg", async () => {
          throw new Error("network down");
        }),
      MobileUploadError
    );
  });
});

describe("Stage 4 — the UI offers exactly the four approved controls", () => {
  const captureSource = readFileSync(join(process.cwd(), "app/mobile/MobileCapture.tsx"), "utf8");
  const pageSource = readFileSync(join(process.cwd(), "app/mobile/page.tsx"), "utf8");
  const code = captureSource
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

  it("has exactly one voice control", () => {
    // One microphone control, and one stop control that exists only while a
    // recording is running. The UI correction replaced the emoji glyphs with
    // real SVG icons, so the controls are counted by their handlers.
    assert.equal((code.match(/onClick=\{startRecording\}/g) ?? []).length, 2); // record + record again
    assert.equal((code.match(/onClick=\{stopRecording\}/g) ?? []).length, 1);
    assert.equal((code.match(/Stop Recording/g) ?? []).length, 1);
  });

  it("has exactly two photo controls, driven by one loop over two slots", () => {
    assert.ok(code.includes('(["photo1", "photo2"] as const)'));
    assert.equal((code.match(/Evidence Photo \$\{index \+ 1\}/g) ?? []).length, 2);
  });

  it("has exactly one REGISTER control", () => {
    // The label is dynamic ("Registering…" while submitting), so the control is
    // identified by its single submit handler rather than by its text.
    assert.equal((code.match(/onClick=\{register\}/g) ?? []).length, 1);
    assert.equal((code.match(/"REGISTER"/g) ?? []).length, 1);
  });

  it("offers no Issue field of any kind", () => {
    for (const forbidden of [
      'name="title"',
      'name="description"',
      'name="category"',
      'name="priority"',
      'name="status"',
      'name="assignee"',
    ]) {
      assert.equal(code.includes(forbidden), false, `must not contain ${forbidden}`);
    }
  });

  it("requests JPEG and the rear camera", () => {
    assert.ok(code.includes('accept="image/jpeg"'));
    assert.ok(code.includes('capture="environment"'));
  });

  it("never reaches the database directly — registration goes through a Server Action", () => {
    // Stage 5 wired REGISTER to registerMobileIssue(). The client still must
    // not import a query module or touch the database itself.
    for (const forbidden of ["createIssue", "next_issue_id", "lib/queries", "lib/db", "issue_tracking"]) {
      assert.equal(code.includes(forbidden), false, `the client must not reference ${forbidden}`);
      assert.equal(pageSource.includes(forbidden), false, `the page must not reference ${forbidden}`);
    }
    assert.ok(code.includes("registerMobileIssue"), "registration must go through the Server Action");
  });

  it("imports no dashboard or portal component", () => {
    for (const forbidden of ["DashboardLayout", "AppSidebar", "IssueTable", "IssueDetail", "VoiceRecorder"]) {
      assert.equal(code.includes(forbidden), false, `must not import ${forbidden}`);
    }
  });

  it("keeps ONE submission id per report and mints attempts per media", () => {
    // The submission id is minted once, at mount, and never reset by the
    // worker — there is no setter at all.
    assert.ok(code.includes("useState<string>(() => crypto.randomUUID())"));
    assert.equal(code.includes("setSubmissionId"), false, "no worker-facing reset may exist");
    // A new attempt is minted only when NEW media is accepted.
    assert.ok(code.includes("const attemptId = crypto.randomUUID();"));
  });

  it("offers NO fifth worker action — exactly four controls", () => {
    for (const forbidden of [
      "Start a new report",
      "New report",
      "Reset report",
      "Clear all",
      "Start over",
    ]) {
      assert.equal(code.includes(forbidden), false, `must not offer "${forbidden}"`);
    }
    // Still exactly one capture surface per medium and one submit.
    assert.equal((code.match(/type="file"/g) ?? []).length, 1); // one loop renders both photos
    assert.equal((code.match(/onClick=\{register\}/g) ?? []).length, 1);
  });

  it("retry reuses the stored attemptId rather than minting one", () => {
    assert.ok(code.includes("const attemptId = slots[slot].attemptId;"));
  });
});

describe("UI correction — icons, playback and previews", () => {
  const captureSource = readFileSync(join(process.cwd(), "app/mobile/MobileCapture.tsx"), "utf8");
  const iconSource = readFileSync(join(process.cwd(), "app/mobile/icons.tsx"), "utf8");

  it("draws its icons inline rather than adding a dependency", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const iconPackage of ["lucide-react", "react-icons", "@heroicons/react", "@fortawesome/react-fontawesome"]) {
      assert.equal(iconPackage in deps, false, `must not add ${iconPackage} just for icons`);
    }
    assert.ok(iconSource.includes("<svg"));
  });

  it("the voice card uses a microphone icon", () => {
    assert.ok(iconSource.includes("export function MicrophoneIcon"));
    assert.ok(captureSource.includes("MicrophoneIcon"));
  });

  it("both photo cards use a camera icon", () => {
    assert.ok(iconSource.includes("export function CameraIcon"));
    assert.ok(captureSource.includes("CameraIcon"));
  });

  it("plays the recording back in an audio element once it lands", () => {
    assert.ok(captureSource.includes("<audio"));
    assert.ok(captureSource.includes("controls"));
    assert.ok(captureSource.includes("src={previews.voice}"));
    // The player is shown in the uploaded branch, not before.
    assert.ok(captureSource.includes("Voice Recorded"));
  });

  it("offers Record Again after a successful recording, on the EXISTING flow", () => {
    assert.ok(captureSource.includes("Record Again"));
    // Record Again is the same deliberate re-record entry point as the first
    // recording, so it mints a new attemptId exactly as before.
    assert.equal((captureSource.match(/onClick=\{startRecording\}/g) ?? []).length, 2);
  });

  it("shows the actual photo, not just a message", () => {
    assert.ok(captureSource.includes("<img"));
    assert.ok(captureSource.includes("src={preview}"));
    assert.ok(captureSource.includes("object-contain"), "must not distort the photo");
    assert.ok(captureSource.includes("max-h-72"), "must not overflow the phone screen");
    assert.ok(captureSource.includes("rounded-xl"));
  });

  it("offers Retake Photo on the existing replacement flow", () => {
    assert.ok(captureSource.includes("Retake Photo"));
    // Retake re-uses the same picker element, so it runs acceptMedia and
    // therefore the same new-attempt/supersede rules.
    assert.equal((captureSource.match(/const picker = \(/g) ?? []).length, 1);
    assert.ok(captureSource.includes("await acceptMedia(slot, file"));
  });

  it("previews are local object URLs that are released again", () => {
    assert.ok(captureSource.includes("URL.createObjectURL(blob)"));
    assert.equal((captureSource.match(/URL\.revokeObjectURL/g) ?? []).length, 2); // replacement + unmount
  });

  it("the preview never becomes the registered asset", () => {
    // What is registered is still Cloudinary's response for each slot.
    assert.ok(captureSource.includes("voice: slots.voice.asset!"));
    assert.ok(captureSource.includes("photo1: slots.photo1.asset!"));
    assert.ok(captureSource.includes("photo2: slots.photo2.asset!"));
    assert.equal(captureSource.includes("secureUrl: preview"), false);
  });

  it("REGISTER still requires all three media and the same guard", () => {
    assert.ok(captureSource.includes("const registerReady = isRegisterReady(slots) && !anyBusy;"));
    assert.ok(captureSource.includes("disabled={!registerReady || registering}"));
    assert.ok(captureSource.includes("if (!registerReady || registering) return;"));
  });

  it("the upload path is untouched by the redesign", () => {
    assert.ok(captureSource.includes("requestMobileUploadTicket({ submissionId, slot, attemptId })"));
    assert.ok(captureSource.includes("uploadToCloudinary("));
    assert.ok(captureSource.includes("registerMobileIssue({"));
  });
});

describe("Stage 4 — attempt ids", () => {
  it("accepts a UUID and rejects anything else", () => {
    assert.equal(isValidAttemptId(crypto.randomUUID()), true);
    for (const bad of ["", "1", "not-a-uuid", "../x", null, undefined, 7]) {
      assert.equal(isValidAttemptId(bad), false, `${String(bad)} must be rejected`);
    }
  });

  it("puts submission, slot and attempt in the public_id, in that order", () => {
    const attempt = crypto.randomUUID();
    assert.equal(
      buildMobilePublicId(SUBMISSION, "photo2", attempt),
      `issue-tracker/mobile/${SUBMISSION}/photo2/${attempt}`
    );
  });

  it("refuses to compose a path for an invalid attempt", () => {
    assert.throws(() => buildMobilePublicId(SUBMISSION, "voice", "nope"), /Invalid attempt id/);
  });
});
