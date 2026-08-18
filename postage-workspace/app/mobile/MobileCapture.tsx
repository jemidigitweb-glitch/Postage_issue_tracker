"use client";

import { useEffect, useRef, useState } from "react";

import {
  MOBILE_MAX_RECORDING_SECONDS,
  MOBILE_SNIFF_BYTES,
  formatDuration,
  validateMobilePhoto,
  validateMobileVoice,
} from "@/lib/mobile/mobileMedia";
import {
  initialSlots,
  isRegisterReady,
  retryUpload,
  selectMedia,
  uploadFailed,
  uploadStarted,
  uploadSucceeded,
  type MobileSlots,
  type SlotState,
} from "@/lib/mobile/mobileSlots";
import { uploadToCloudinary } from "@/lib/mobile/mobileUpload";
import type { MobileUploadSlot } from "@/lib/mobile/mobileAccess";
import { requestMobileUploadTicket } from "./upload-actions";
import { registerMobileIssue } from "./register-actions";
import { supersededAssets } from "@/lib/mobile/mobileSlots";

// WAREHOUSE MOBILE LITE — the worker's four controls.
//
// Exactly: Record Voice, Take Evidence Photo 1, Take Evidence Photo 2,
// REGISTER — plus the status text a worker needs to know what is happening.
// There is no title, description, domain, priority, status, assignment,
// investigation, resolution, comment, filter, report or navigation control
// here, and no route out of /mobile.
//
// ── WHERE THE BYTES GO ──────────────────────────────────────────────────────
// The file never touches this application's server. For each upload the client
// asks for a signed ticket (a few hundred bytes of JSON) and then POSTs the
// file DIRECTLY to Cloudinary. Vercel rejects any function request body over
// 4.5 MB, and one phone photo can exceed that on its own.
//
// ── RETRY vs REPLACE ────────────────────────────────────────────────────────
// Retry keeps the attemptId, so the same public_id is reused and no duplicate
// asset appears. A deliberate re-record/retake mints a NEW attemptId, so the
// previous upload is never overwritten (uploads are signed overwrite=false)
// and is recorded as superseded instead.
//
// ── STAGE 4 BOUNDARY ────────────────────────────────────────────────────────
// REGISTER becomes enabled once all three uploads have succeeded and DOES
// NOTHING ELSE. It creates no Issue, writes no database row, and shows no
// Issue ID — that is Stage 5. The button says so rather than implying success.

type BusyMap = Record<MobileUploadSlot, boolean>;

const cardClassName =
  "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4";
const actionButtonClassName =
  "w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4 text-left text-base font-medium text-neutral-800 dark:text-neutral-100 active:scale-[0.99] transition-transform disabled:opacity-60 disabled:cursor-not-allowed";
const smallButtonClassName =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 disabled:opacity-60";

/** Reads the first bytes so validation decides on content, not on a filename
 *  a phone chose. */
async function readHead(file: Blob): Promise<Uint8Array> {
  const slice = file.slice(0, MOBILE_SNIFF_BYTES);
  return new Uint8Array(await slice.arrayBuffer());
}

function statusLine(state: SlotState): string {
  switch (state.status) {
    case "empty":
      return "Not added yet";
    case "ready":
      return "Ready to upload";
    case "uploading":
      return "Uploading…";
    case "uploaded":
      return "Uploaded ✓";
    case "failed":
      return state.error ?? "Upload failed";
  }
}

export default function MobileCapture() {
  // ONE submission id for the whole report. It survives every failure, retry,
  // re-record and replacement.
  //
  // There is deliberately NO worker-facing reset: the screen offers exactly
  // four actions. A fresh submission id will be minted automatically after a
  // successful registration, which Stage 5 owns — so no unused reset path is
  // left behind here.
  const [submissionId] = useState<string>(() => crypto.randomUUID());
  const [slots, setSlots] = useState<MobileSlots>(() => initialSlots());
  const [busy, setBusy] = useState<BusyMap>({ voice: false, photo1: false, photo2: false });
  const [registering, setRegistering] = useState(false);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Recording state.
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [recordingSupported, setRecordingSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** The file behind the current attempt per slot, so a retry can re-send the
   *  very same bytes without asking the worker to do anything again. */
  const filesRef = useRef<Partial<Record<MobileUploadSlot, { blob: Blob; name: string }>>>({});

  useEffect(() => {
    setRecordingSupported(
      typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  // Leaving the page mid-recording must not leave the microphone open.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function updateSlot(slot: MobileUploadSlot, next: (state: SlotState) => SlotState) {
    setSlots((current) => ({ ...current, [slot]: next(current[slot]) }));
  }

  /** Ticket → direct Cloudinary upload → active asset. Never sends bytes to
   *  this application's server. */
  async function upload(slot: MobileUploadSlot, attemptId: string) {
    const file = filesRef.current[slot];
    if (!file) return;

    setBusy((current) => ({ ...current, [slot]: true }));
    updateSlot(slot, uploadStarted);

    try {
      const ticketState = await requestMobileUploadTicket({ submissionId, slot, attemptId });
      if (!ticketState.ticket) {
        updateSlot(slot, (state) => uploadFailed(state, ticketState.error ?? "Upload failed."));
        return;
      }
      const asset = await uploadToCloudinary(
        ticketState.ticket,
        file.blob,
        file.name,
        // The browser's own fetch. Typed loosely so tests can substitute one.
        fetch as unknown as Parameters<typeof uploadToCloudinary>[3]
      );
      updateSlot(slot, (state) => uploadSucceeded(state, asset));
    } catch (error) {
      updateSlot(slot, (state) =>
        uploadFailed(state, error instanceof Error ? error.message : "Upload failed.")
      );
    } finally {
      setBusy((current) => ({ ...current, [slot]: false }));
    }
  }

  /** A NEW deliberate attempt: validate, mint a new attemptId, upload. */
  async function acceptMedia(slot: MobileUploadSlot, blob: Blob, name: string) {
    const head = await readHead(blob);
    const check =
      slot === "voice"
        ? validateMobileVoice({ size: blob.size, head })
        : validateMobilePhoto({ size: blob.size, head });

    if (!check.ok) {
      updateSlot(slot, (state) => uploadFailed(state, check.error));
      return;
    }

    const attemptId = crypto.randomUUID();
    filesRef.current[slot] = { blob, name };
    updateSlot(slot, (state) => selectMedia(state, attemptId));
    await upload(slot, attemptId);
  }

  /** Retry of the SAME file: the attemptId is deliberately reused. */
  async function retry(slot: MobileUploadSlot) {
    const attemptId = slots[slot].attemptId;
    if (!attemptId) return;
    updateSlot(slot, retryUpload);
    await upload(slot, attemptId);
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function startRecording() {
    setRecorderError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Only containers the existing media system already accepts.
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferred.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        await acceptMedia("voice", blob, `voice-recording.${extension}`);
      };

      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((value) => {
          const next = value + 1;
          // Hard stop at the Version 1 limit — the recording so far is KEPT.
          if (next >= MOBILE_MAX_RECORDING_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setRecorderError(
        "Microphone permission denied, or no microphone is available. Allow microphone access and try again."
      );
    }
  }

  const anyBusy = busy.voice || busy.photo1 || busy.photo2 || recording;
  // Ready only when all three ACTIVE uploads have succeeded and nothing is in
  // flight — a replacement mid-upload correctly un-readies the form.
  const registerReady = isRegisterReady(slots) && !anyBusy;

  /** The one write. Guarded against a double tap by `registering`, and
   *  idempotent server-side by the submission id, so even a duplicated request
   *  returns the SAME Issue rather than creating a second one. */
  async function register() {
    if (!registerReady || registering) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const result = await registerMobileIssue({
        submissionId,
        assets: {
          voice: slots.voice.asset!,
          photo1: slots.photo1.asset!,
          photo2: slots.photo2.asset!,
        },
        superseded: supersededAssets(slots),
      });
      if (result.issueId) {
        setRegisteredId(result.issueId);
      } else {
        // The uploaded media is deliberately kept, so the worker can simply
        // press REGISTER again.
        setRegisterError(result.error ?? "Could not register this report. Please try again.");
      }
    } catch {
      setRegisterError("Could not register this report. Please try again.");
    } finally {
      setRegistering(false);
    }
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  // The confirmation replaces the form entirely: there is nothing further to
  // do, and no fifth action is offered. The ID shown is the REAL generated
  // Issue ID returned by the database.
  if (registeredId) {
    return (
      <div className={`${cardClassName} text-center`}>
        <p className="text-base font-semibold">Issue Registered</p>
        <p className="mt-2 text-lg font-bold tracking-tight">Issue ID: {registeredId}</p>
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Your voice recording and both photos have been attached.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 1. RECORD VOICE ───────────────────────────────────────────── */}
      <section className={cardClassName}>
        {recording ? (
          <button type="button" onClick={stopRecording} className={actionButtonClassName}>
            ⏹ Stop Recording — {formatDuration(seconds)} / {formatDuration(MOBILE_MAX_RECORDING_SECONDS)}
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={busy.voice || !recordingSupported}
            className={actionButtonClassName}
          >
            🎙️ {slots.voice.status === "uploaded" ? "Record Voice again" : "Record Voice"}
          </button>
        )}

        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {recorderError ?? (recording ? "Recording…" : statusLine(slots.voice))}
        </p>

        {!recordingSupported && (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Recording is not supported on this browser.
          </p>
        )}

        {slots.voice.status === "failed" && (
          <button
            type="button"
            onClick={() => retry("voice")}
            disabled={busy.voice}
            className={`${smallButtonClassName} mt-2`}
          >
            Retry upload
          </button>
        )}
      </section>

      {/* ── 2 & 3. EVIDENCE PHOTOS ────────────────────────────────────── */}
      {(["photo1", "photo2"] as const).map((slot, index) => (
        <section key={slot} className={cardClassName}>
          <label className={`${actionButtonClassName} block cursor-pointer`}>
            📷 {slots[slot].status === "uploaded" ? `Replace Evidence Photo ${index + 1}` : `Take Evidence Photo ${index + 1}`}
            <input
              type="file"
              accept="image/jpeg"
              capture="environment"
              className="hidden"
              disabled={busy[slot]}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                // Cleared so picking the SAME file again still fires a change.
                event.target.value = "";
                if (file) await acceptMedia(slot, file, file.name || `photo-${index + 1}.jpg`);
              }}
            />
          </label>

          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {statusLine(slots[slot])}
          </p>

          {slots[slot].status === "failed" && (
            <button
              type="button"
              onClick={() => retry(slot)}
              disabled={busy[slot]}
              className={`${smallButtonClassName} mt-2`}
            >
              Retry upload
            </button>
          )}
        </section>
      ))}

      {/* ── 4. REGISTER ───────────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={register}
          disabled={!registerReady || registering}
          className="w-full rounded-xl bg-neutral-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900"
        >
          {registering ? "Registering…" : "REGISTER"}
        </button>
        <p role="status" className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {registering
            ? "Registering your report…"
            : registerReady
              ? "Ready to register."
              : "Add a voice recording and both photos to continue."}
        </p>
        {registerError && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {registerError} Your recording and photos are still here — press REGISTER again.
          </p>
        )}
      </div>

    </div>
  );
}
