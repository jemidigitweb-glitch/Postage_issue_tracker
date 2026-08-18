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
import {
  AlertIcon,
  CameraIcon,
  CheckIcon,
  MicrophoneIcon,
  RetryIcon,
  SpinnerIcon,
  StopIcon,
} from "./icons";

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
// ── UI CORRECTION (after real iPhone testing) ───────────────────────────────
// The capture, upload, retry/replace and registration behaviour below is
// UNCHANGED. What changed is presentation only:
//   - card-based mobile layout with real microphone/camera icons
//   - the recording is played back in an <audio> element once it lands
//   - each photo is shown as an actual image once it lands
//   - "Record Again" / "Retake Photo" drive the EXISTING replacement flow
// The previews are local object URLs taken from the very blob that was
// uploaded, so they render instantly, cost no bandwidth, and prove to the
// worker that the right media was captured. They are revoked on replacement
// and on unmount.

type BusyMap = Record<MobileUploadSlot, boolean>;
type PreviewMap = Record<MobileUploadSlot, string | null>;

const cardClassName =
  "rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm";
const actionButtonClassName =
  "flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-4 py-5 text-base font-semibold text-neutral-900 dark:text-neutral-50 active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed";
const smallButtonClassName =
  "flex items-center justify-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200 active:scale-[0.99] transition-transform disabled:opacity-50";
const doneHeadingClassName =
  "flex items-center gap-2 text-[15px] font-semibold text-emerald-700 dark:text-emerald-400";
const hintClassName = "text-xs text-neutral-500 dark:text-neutral-400";

/** Step chip + icon tile, so each card is identifiable at a glance. */
function CardHead({
  step,
  title,
  done,
  icon,
}: {
  step: number;
  title: string;
  done: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
          done
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            : "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Step {step}
        </p>
        <p className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </p>
      </div>
    </div>
  );
}

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

  // Local playback/preview URLs. PRESENTATION ONLY — never sent anywhere, and
  // never used as the registered asset (that is always Cloudinary's response).
  const [previews, setPreviews] = useState<PreviewMap>({
    voice: null,
    photo1: null,
    photo2: null,
  });
  const previewsRef = useRef<PreviewMap>({ voice: null, photo1: null, photo2: null });

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

  // Leaving the page mid-recording must not leave the microphone open, and must
  // not leak the local preview URLs either.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      for (const url of Object.values(previewsRef.current)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, []);

  /** Swaps in a fresh local preview, releasing the one it replaces. */
  function setPreview(slot: MobileUploadSlot, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const previous = previewsRef.current[slot];
    previewsRef.current = { ...previewsRef.current, [slot]: url };
    setPreviews((current) => ({ ...current, [slot]: url }));
    if (previous) URL.revokeObjectURL(previous);
  }

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
    setPreview(slot, blob);
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
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <CheckIcon className="h-7 w-7" />
        </span>
        <p className="mt-3 text-base font-semibold">Issue Registered</p>
        <p className="mt-2 text-lg font-bold tracking-tight">Issue ID: {registeredId}</p>
        <p className={`mt-3 ${hintClassName}`}>
          Your voice recording and both photos have been attached.
        </p>
      </div>
    );
  }

  const voiceDone = slots.voice.status === "uploaded";

  return (
    <div className="flex flex-col gap-4">
      {/* ── 1. RECORD VOICE ───────────────────────────────────────────── */}
      <section className={cardClassName}>
        <CardHead
          step={1}
          title="Voice Recording"
          done={voiceDone}
          icon={<MicrophoneIcon className="h-6 w-6" />}
        />

        {recording ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-4 dark:bg-red-950/40">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="text-base font-semibold tabular-nums text-red-700 dark:text-red-300">
                Recording {formatDuration(seconds)} / {formatDuration(MOBILE_MAX_RECORDING_SECONDS)}
              </span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className={`${actionButtonClassName} border-red-200 bg-red-600 text-white dark:border-red-900 dark:bg-red-600 dark:text-white`}
            >
              <StopIcon className="h-5 w-5" />
              Stop Recording
            </button>
          </div>
        ) : voiceDone ? (
          <div className="flex flex-col gap-3">
            <p className={doneHeadingClassName}>
              Voice Recorded
              <CheckIcon className="h-5 w-5" />
            </p>
            {previews.voice && (
              <audio
                controls
                preload="metadata"
                src={previews.voice}
                className="w-full"
                aria-label="Play back your voice recording"
              />
            )}
            <button
              type="button"
              onClick={startRecording}
              disabled={busy.voice || !recordingSupported}
              className={smallButtonClassName}
            >
              <RetryIcon className="h-4 w-4" />
              Record Again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={busy.voice || !recordingSupported}
            className={actionButtonClassName}
          >
            {busy.voice ? <SpinnerIcon className="h-5 w-5" /> : <MicrophoneIcon className="h-5 w-5" />}
            Record Voice
          </button>
        )}

        <p className={`mt-3 ${hintClassName}`}>
          {recorderError ?? (recording ? "Recording…" : statusLine(slots.voice))}
        </p>

        {!recordingSupported && (
          <p className={`mt-1 ${hintClassName}`}>Recording is not supported on this browser.</p>
        )}

        {slots.voice.status === "failed" && (
          <button
            type="button"
            onClick={() => retry("voice")}
            disabled={busy.voice}
            className={`${smallButtonClassName} mt-3 w-full`}
          >
            <RetryIcon className="h-4 w-4" />
            Retry upload
          </button>
        )}
      </section>

      {/* ── 2 & 3. EVIDENCE PHOTOS ────────────────────────────────────── */}
      {(["photo1", "photo2"] as const).map((slot, index) => {
        const done = slots[slot].status === "uploaded";
        const preview = previews[slot];
        const picker = (
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
        );

        return (
          <section key={slot} className={cardClassName}>
            <CardHead
              step={index + 2}
              title={`Evidence Photo ${index + 1}`}
              done={done}
              icon={<CameraIcon className="h-6 w-6" />}
            />

            {done ? (
              <div className="flex flex-col gap-3">
                <p className={doneHeadingClassName}>
                  Photo captured
                  <CheckIcon className="h-5 w-5" />
                </p>
                {preview && (
                  // A local object URL for the exact captured file — next/image
                  // cannot optimise a blob: URL, and no remote fetch is wanted.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt={`Evidence photo ${index + 1} preview`}
                    className="max-h-72 w-full rounded-xl border border-neutral-200 object-contain dark:border-neutral-800"
                  />
                )}
                <label className={`${smallButtonClassName} cursor-pointer`}>
                  <RetryIcon className="h-4 w-4" />
                  Retake Photo
                  {picker}
                </label>
              </div>
            ) : (
              <label className={`${actionButtonClassName} cursor-pointer`}>
                {busy[slot] ? <SpinnerIcon className="h-5 w-5" /> : <CameraIcon className="h-5 w-5" />}
                {`Take Evidence Photo ${index + 1}`}
                {picker}
              </label>
            )}

            <p className={`mt-3 ${hintClassName}`}>{statusLine(slots[slot])}</p>

            {slots[slot].status === "failed" && (
              <button
                type="button"
                onClick={() => retry(slot)}
                disabled={busy[slot]}
                className={`${smallButtonClassName} mt-3 w-full`}
              >
                <RetryIcon className="h-4 w-4" />
                Retry upload
              </button>
            )}
          </section>
        );
      })}

      {/* ── 4. REGISTER ───────────────────────────────────────────────── */}
      <div className="pb-2">
        <button
          type="button"
          onClick={register}
          disabled={!registerReady || registering}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-5 text-base font-bold tracking-wide text-white shadow-sm active:scale-[0.99] transition-transform disabled:opacity-40 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900"
        >
          {registering ? (
            <SpinnerIcon className="h-5 w-5" />
          ) : (
            <CheckIcon className="h-5 w-5" />
          )}
          {registering ? "Registering…" : "REGISTER"}
        </button>
        <p role="status" className={`mt-2 text-center ${hintClassName}`}>
          {registering
            ? "Registering your report…"
            : registerReady
              ? "Ready to register."
              : "Add a voice recording and both photos to continue."}
        </p>
        {registerError && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertIcon className="mt-0.5 h-4 w-4" />
            <span>
              {registerError} Your recording and photos are still here — press REGISTER again.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
