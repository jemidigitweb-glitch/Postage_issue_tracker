"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Small in-browser voice recorder for Issue evidence.
//
// ── MICROPHONE PERMISSION ───────────────────────────────────────────────────
// getUserMedia() is called ONLY from the Record button's click handler. Merely
// opening the New Issue page requests nothing, and there is no autoplay and no
// auto-start of any kind. The moment recording stops, every track on the
// stream is stopped, so the browser's "recording" indicator clears instead of
// lingering for the rest of the session.
//
// ── HOW THE RECORDING REACHES THE SERVER ────────────────────────────────────
// A recorded blob is held in memory and previewed locally. Nothing is sent
// anywhere until the user clicks "Attach recording", which writes the blob
// into a real hidden <input type="file"> using a DataTransfer. From that point
// it is an ordinary form file: it travels in the same FormData as an uploaded
// audio file, through the same Server Action, the same byte-level validation,
// and the same signed server-side upload. There is no separate client upload
// path and no storage credential in the browser.
//
// ── UNSUPPORTED BROWSERS ────────────────────────────────────────────────────
// If MediaRecorder or getUserMedia is missing, the recorder renders a plain
// message pointing at the file input instead. Issue creation is never blocked
// by the absence of recording support.

type RecorderState = "idle" | "recording" | "recorded";

/** Preferred containers, best-supported first. Chrome/Edge produce webm/opus;
 *  Safari produces mp4. Whatever the browser picks is checked server-side by
 *  its bytes anyway, so this list only affects quality of the first choice. */
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Extension matching the container, so the stored filename is honest. */
function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Whether this browser can record at all. Reads `navigator`, so it must never
 *  run during the server render — see the useSyncExternalStore below. */
function detectSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** No subscription: capability does not change during a page's life. */
function subscribeToNothing(): () => void {
  return () => {};
}

export default function VoiceRecorder({ inputName }: { inputName: string }) {
  // useSyncExternalStore is the hydration-safe way to read a browser
  // capability: the server snapshot is `null` ("not known yet"), the client
  // snapshot is the real answer, and React reconciles the two without a
  // mismatch. Deliberately NOT an effect that calls setState (which is both a
  // lint error and an extra render), and deliberately not a useState
  // initializer, which would compute `false` during SSR and `true` on the
  // client — a hydration mismatch.
  const supported = useSyncExternalStore(subscribeToNothing, detectSupport, () => null);

  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // Leaving the page mid-recording must not leave the microphone open or the
  // object URL leaked.
  useEffect(() => {
    return () => {
      stopTimer();
      releaseStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // previewUrl is intentionally excluded: this cleanup is for unmount only,
    // and the URL is revoked explicitly wherever it is replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    try {
      // THE permission prompt. Reached only from this click.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(blob);
        });
        setState("recorded");
        releaseStream();
      };

      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      // Covers a denied permission, no microphone, and an insecure origin.
      // No raw error is surfaced — the message would vary by browser and say
      // nothing the user can act on.
      releaseStream();
      setError(
        "Could not start recording. Check that a microphone is connected and that this site is allowed to use it."
      );
      setState("idle");
    }
  }

  function stopRecording() {
    stopTimer();
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  /** Writes the blob into the real file input via DataTransfer, so it submits
   *  with the form exactly like a picked file. */
  function attachRecording() {
    const blob = blobRef.current;
    const input = fileInputRef.current;
    if (!blob || !input) return;

    const extension = extensionFor(blob.type);
    const file = new File([blob], `voice-recording.${extension}`, {
      type: blob.type,
      lastModified: Date.now(),
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    setAttached(true);
  }

  function removeRecording() {
    stopTimer();
    releaseStream();
    blobRef.current = null;
    chunksRef.current = [];
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAttached(false);
    setSeconds(0);
    setState("idle");
  }

  const buttonBase =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
  const primaryButton = `${buttonBase} bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-90`;
  const secondaryButton = `${buttonBase} border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800`;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Voice recording</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Record a short voice note as evidence. Nothing is uploaded until you attach it and submit
          the Issue.
        </p>
      </div>

      {/* The real form control. Always present so the field name exists;
          populated only by "Attach recording". */}
      <input ref={fileInputRef} type="file" name={inputName} accept="audio/*" className="hidden" />

      {supported === false ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Voice recording is not supported in this browser. You can upload an audio file instead.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {state === "idle" && (
              <button type="button" onClick={startRecording} className={primaryButton}>
                Record voice
              </button>
            )}

            {state === "recording" && (
              <>
                <span className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-500 animate-pulse" />
                  Recording · {formatDuration(seconds)}
                </span>
                <button type="button" onClick={stopRecording} className={primaryButton}>
                  Stop
                </button>
              </>
            )}

            {state === "recorded" && (
              <>
                <button
                  type="button"
                  onClick={attachRecording}
                  disabled={attached}
                  className={primaryButton}
                >
                  {attached ? "Recording attached" : "Attach recording"}
                </button>
                <button type="button" onClick={removeRecording} className={secondaryButton}>
                  Remove
                </button>
                <button type="button" onClick={startRecording} className={secondaryButton}>
                  Record again
                </button>
              </>
            )}
          </div>

          {/* Local preview only — the blob never leaves the browser until the
              form is submitted. No autoplay: `controls` without `autoPlay`. */}
          {previewUrl && (
            <audio controls src={previewUrl} className="w-full max-w-md">
              Your browser cannot play this recording.
            </audio>
          )}

          {attached && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Attached. It will be uploaded when you create the Issue.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
