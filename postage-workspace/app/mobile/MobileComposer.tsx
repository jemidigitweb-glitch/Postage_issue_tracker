"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import {
  MOBILE_MAX_RECORDING_SECONDS,
  MOBILE_SNIFF_BYTES,
  formatDuration,
  validateMobilePhoto,
  validateMobileVoice,
} from "@/lib/mobile/mobileMedia";
import {
  MOBILE_MAX_PHOTOS,
  MOBILE_MAX_VOICES,
  type MobileUploadSlot,
} from "@/lib/mobile/mobileAccess";
import {
  addPhoto,
  addVoice,
  adjacentPhotoId,
  canAddPhoto,
  canAddVoice,
  draftSummary,
  draftSupersededAssets,
  draftToRegistrationItems,
  emptyIssueDraft,
  findPhoto,
  findVoice,
  isDraftBusy,
  isDraftSendable,
  hasMeaningfulText,
  isDraftValid,
  mediaFailed,
  mediaUploaded,
  nextPhotoSlot,
  nextVoiceSlot,
  photoAssets,
  photoCount,
  photoIndex,
  removePhoto,
  removeVoice,
  retryMedia,
  setDraftText,
  setPhotoCaption,
  voiceAssets,
  voiceCount,
  voiceIndex,
  type IssueDraft,
} from "@/lib/mobile/mobileDraft";
import {
  MEDIA_DENIED_MESSAGE,
  declineMediaConsent,
  grantMediaConsent,
  initialMediaConsent,
  mediaConsentPrompt,
  needsMediaConsent,
  type MediaConsentKind,
} from "@/lib/mobile/mediaConsent";
import { MOBILE_MAX_CAPTION_LENGTH, MOBILE_MAX_TEXT_LENGTH } from "@/lib/mobile/mobileRegistration";
import type { UploadedAsset } from "@/lib/mobile/mobileSlots";
import { uploadToCloudinary } from "@/lib/mobile/mobileUpload";
import { requestMobileUploadTicket } from "./upload-actions";
import { registerMobileIssue } from "./register-actions";
import { PhotoReviewBody, VoiceReviewBody } from "./ReviewScreens";
import {
  AlertIcon,
  BackIcon,
  CameraIcon,
  CheckIcon,
  CloseIcon,
  GalleryIcon,
  MicrophoneIcon,
  PlusIcon,
  RetryIcon,
  SendIcon,
  SpinnerIcon,
  StopIcon,
} from "./icons";

// WAREHOUSE MOBILE LITE — STAGE 2: the Issue composer.
//
// ── ONE SCREEN IS ONE ISSUE ─────────────────────────────────────────────────
// This is not a conversation. The whole screen is ONE IssueDraft — text, photos
// and up to five recordings — and there is exactly ONE registration. Any single
// part is a complete Issue on its own: text alone, a photo alone, a recording
// alone, or any combination. Nothing is mandatory.
//
// ── SEVERAL RECORDINGS, ONE ISSUE ───────────────────────────────────────────
// SUPERSEDED: a report carried ONE recording, and making a second one silently
// replaced the first. A worker can now record, return to the composer, record
// again, and repeat up to five times; all of them leave together as one Issue,
// in the order they were made. Each plays, uploads, retries and is removed
// independently of the others, of the photos and of the typed note.
//
// ── MEDIA IS STAGED THE MOMENT IT IS TAKEN ──────────────────────────────────
// SUPERSEDED: an earlier revision made the worker press "Add Photo" to move a
// picked photo into the draft. That created a second thing that looked like a
// submit button and, in manual UAT, read as though the photo were being sent on
// its own. There is no Add Photo now: picking or capturing a photo puts it in
// the draft immediately, and the review screen is exactly that — a review.
//
// ── ONE SEND, WHEREVER IT IS PRESSED ────────────────────────────────────────
// Send exists on the main composer, the photo review and the voice review. All
// three call the SAME requestSendCurrentDraft(), which inspects the COMPLETE
// draft and opens the confirmation. There is no photoSend/voiceSend/textSend,
// so no screen can build a different payload from the one the worker sees.
// Only "Yes, Send Issue" reaches registerMobileIssue(), once, with the whole
// draft — and "Back" returns to whichever screen the send came from, unchanged.
//
// ── WHERE THE BYTES GO — UNCHANGED ──────────────────────────────────────────
// A file never touches this application's server. Each upload asks for a signed
// ticket (a few hundred bytes of JSON) and POSTs the file DIRECTLY to
// Cloudinary, because Vercel rejects any function request body over 4.5 MB.
//
// ── THIS VERSION IS REVIEW-ONLY ─────────────────────────────────────────────
// Photos render and the recording plays, but there is no Edit, Remove, Retake,
// Reselect, Record Again, long-press menu or right-click menu.

/** Which screen the worker is on. The draft is the same on all of them. */
type Screen = "main" | "photo" | "voice";


/**
 * What was actually registered — a snapshot of the draft, taken the moment the
 * database returned an Issue ID.
 *
 * ── WHY A SNAPSHOT ──────────────────────────────────────────────────────────
 * The draft is cleared on success, so the sent content cannot be rendered from
 * it afterwards. It is copied here first, and this copy is READ-ONLY: it is
 * never edited, re-uploaded or re-sent. Purely client UI state — no chat
 * backend, no message table, nothing stored.
 */
interface SentIssue {
  issueId: string;
  draft: IssueDraft;
}

/** Sent content, and ONLY sent content, is styled as an outgoing bubble. */
const sentBubbleClassName =
  "max-w-[85%] rounded-2xl rounded-br-md bg-emerald-50 p-2.5 text-[15px] text-neutral-900 shadow-sm dark:bg-emerald-950/50 dark:text-neutral-50";
/** Incoming reply: left-aligned, compact, never a centred card. */
const replyBubbleClassName =
  "max-w-[85%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm dark:bg-neutral-900";
/** Sized so + / camera / mic / send and the input all fit one 360px row. */
const roundButtonClassName =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform disabled:opacity-40";
const barClassName =
  "border-t border-neutral-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 dark:border-neutral-800 dark:bg-neutral-950";
const menuRowClassName =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-800 disabled:opacity-40 dark:text-neutral-100";
const textInputClassName =
  "min-w-0 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50";

/** A very subtle dot pattern — drawn in CSS, no third-party asset of any kind. */
const chatBackground = {
  backgroundImage:
    "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.055) 1px, transparent 0)",
  backgroundSize: "18px 18px",
};

async function readHead(file: Blob): Promise<Uint8Array> {
  const slice = file.slice(0, MOBILE_SNIFF_BYTES);
  return new Uint8Array(await slice.arrayBuffer());
}

export default function MobileComposer() {
  // ONE submission id for the whole Issue. It survives every failure and retry,
  // and it is what makes registration idempotent.
  const [submissionId, setSubmissionId] = useState<string>(() => crypto.randomUUID());
  const [draft, setDraft] = useState<IssueDraft>(() => emptyIssueDraft());

  const [screen, setScreen] = useState<Screen>("main");
  const [reviewPhotoId, setReviewPhotoId] = useState<string | null>(null);
  /** Which recording the voice review screen is showing. Several can exist. */
  const [reviewVoiceId, setReviewVoiceId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  /** The confirmation, and the screen it must return to. */
  const [confirming, setConfirming] = useState(false);
  const [confirmOrigin, setConfirmOrigin] = useState<Screen>("main");

  const [registering, setRegistering] = useState(false);


  /** Every Issue registered on this page, in order. Session UI state only —
   *  no chat table, no message rows, nothing persisted. */
  const [submittedIssues, setSubmittedIssues] = useState<SentIssue[]>([]);
  /** The latest failure, shown as one incoming reply. */
  const [failure, setFailure] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [recordingSupported, setRecordingSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  /** The bytes behind each item's current attempt, so a retry re-sends exactly
   *  the same file without asking the worker to do anything again. */
  const filesRef = useRef<Map<string, { blob: Blob; name: string }>>(new Map());
  /** Every local object URL created, so none is leaked. */
  const objectUrlsRef = useRef<Set<string>>(new Set());
  /** Slots already spent in this submission. Never recycled — the Cloudinary
   *  asset still lives at that path and uploads are signed overwrite=false. */
  const usedSlotsRef = useRef<Set<string>>(new Set());
  /** Assets dropped by the × on a thumbnail. Cleaned up by the existing
   *  namespace-checked path, and only AFTER a successful registration. */
  const removedAssetsRef = useRef<UploadedAsset[]>([]);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRecordingSupported(
      typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    const stream = streamRef.current;
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stream?.getTracks().forEach((track) => track.stop());
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (screen === "main") endRef.current?.scrollIntoView({ block: "end" });
  }, [draft.photos.length, draft.voices.length, submittedIssues.length, failure, screen]);

  function trackObjectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }

  function releaseObjectUrl(url: string | null) {
    if (!url) return;
    if (objectUrlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }

  // ── uploads ───────────────────────────────────────────────────────────────

  async function upload(itemId: string, slot: MobileUploadSlot, attemptId: string) {
    const file = filesRef.current.get(itemId);
    if (!file) return;
    try {
      const ticketState = await requestMobileUploadTicket({ submissionId, slot, attemptId });
      if (!ticketState.ticket) {
        setDraft((current) => mediaFailed(current, itemId, ticketState.error ?? "Upload failed."));
        return;
      }
      const asset = await uploadToCloudinary(
        ticketState.ticket,
        file.blob,
        file.name,
        fetch as unknown as Parameters<typeof uploadToCloudinary>[3]
      );
      setDraft((current) => mediaUploaded(current, itemId, asset));
    } catch (error) {
      setDraft((current) =>
        mediaFailed(current, itemId, error instanceof Error ? error.message : "Upload failed.")
      );
    }
  }

  async function retry(id: string, slot: MobileUploadSlot, attemptId: string) {
    setDraft((current) => retryMedia(current, id));
    await upload(id, slot, attemptId);
  }

  // ── photos ────────────────────────────────────────────────────────────────
  //
  // NOTHING on these paths touches draft.text. The worker's note is a field of
  // the draft, not something that has to be committed before media can arrive.

  // ── media consent ─────────────────────────────────────────────────────────
  //
  // Every Gallery, Camera and Microphone entry point goes through here. A media
  // button never opens a device itself: it calls requestConsent(), and the
  // actual media call happens in exactly one place — openMedia().
  //
  // ── ASK ONCE PER KIND, PER SESSION ────────────────────────────────────────
  // SUPERSEDED: the sheet appeared on EVERY tap, so recording three voice notes
  // meant reading the same paragraph three times. `consentState` now remembers
  // which explanations this session has already accepted. The three kinds are
  // separate — the photo picker says nothing about the microphone.
  //
  // ── WHAT "REMEMBERED" DOES NOT MEAN ───────────────────────────────────────
  // It never opens anything on its own. openMedia() is reachable ONLY from the
  // worker's tap on a media button, or from the confirm button of the sheet
  // that tap opened. Nothing calls it on mount, after login, after a successful
  // registration, or when the next Issue starts.
  //
  // ── AND IT IS NOT PERSISTED ───────────────────────────────────────────────
  // Plain component state: nothing is written to the device, to a cookie, or to
  // the database, and there is no saved user preference. A logout, a refresh or
  // a remount all start again at "unknown".

  /** Which explanations this session has accepted. Reset only by remounting. */
  const [consentState, setConsentState] = useState(initialMediaConsent);
  /** Which sheet is open, or null. */
  const [consent, setConsent] = useState<MediaConsentKind | null>(null);

  /**
   * THE ONLY PLACE A DEVICE OR PICKER IS OPENED. One tap, one call.
   *
   * Keeping it single means "did consent cause an access?" is answerable by
   * reading its two call sites, rather than by auditing every button.
   */
  function openMedia(kind: MediaConsentKind) {
    if (kind === "gallery") galleryInputRef.current?.click();
    else if (kind === "camera") cameraInputRef.current?.click();
    else if (kind === "voice") void startRecording();
  }

  /**
   * A media button was tapped.
   *
   * First use of this kind this session -> show our explanation, open nothing.
   * Already accepted                    -> straight to the existing flow, with
   *                                        no second explanation. The tap is
   *                                        still the worker's own.
   */
  function requestConsent(kind: MediaConsentKind) {
    setMenuOpen(false);
    if (needsMediaConsent(consentState, kind)) {
      // Asking touches no device and no draft: it sets one piece of UI state.
      setConsent(kind);
      return;
    }
    openMedia(kind);
  }

  /** Cancel. Nothing is opened, nothing is uploaded, NOTHING IS REMEMBERED —
   *  so the next attempt asks again — and the draft (text, photos, captions,
   *  voices, submissionId) is not touched at all. */
  function declineConsent() {
    const kind = consent;
    setConsent(null);
    if (kind) setConsentState((current) => declineMediaConsent(current, kind));
    // Defensive: if a stream is somehow still open, it does not stay open.
    stopMediaTracks();
  }

  function acceptConsent() {
    const kind = consent;
    setConsent(null);
    if (!kind) return;
    // Recorded BEFORE the device is touched, so the answer survives even if the
    // browser then refuses: our explanation was read and accepted either way.
    setConsentState((current) => grantMediaConsent(current, kind));
    openMedia(kind);
  }

  /** Releases the microphone. Used on cancel, on unmount, and after a failed
   *  or finished recording — a track left running is a live microphone. */
  function stopMediaTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function openCamera() {
    requestConsent("camera");
  }

  function openGallery() {
    requestConsent("gallery");
  }

  function openVoice() {
    requestConsent("voice");
  }

  /**
   * A picked or captured photo joins the draft IMMEDIATELY and starts
   * uploading. There is no Add Photo step.
   *
   * ── WHO GETS THE REVIEW SCREEN ──────────────────────────────────────────
   * `review` is true only for the CAMERA, which produces one photo at a time:
   * that single capture opens its review so a caption can be typed and the
   * shot checked.
   *
   * The GALLERY passes false. A worker picking four photos does not want four
   * review screens in a row, so those go straight into the draft strip and the
   * worker stays where they were. Any of them can still be opened later by
   * tapping its thumbnail — that is the same review screen, reached when it is
   * wanted rather than imposed four times.
   *
   * Every photo uploads independently: they appear at once, each carrying its
   * own Uploading / ready / failed state, and one failure never disturbs the
   * others, the typed note, or the recording.
   */
  async function stagePhotos(files: File[], review: boolean) {
    setMediaError(null);
    const room = MOBILE_MAX_PHOTOS - photoCount(draft);
    if (room <= 0) {
      setMediaError(`An Issue may carry at most ${MOBILE_MAX_PHOTOS} photos.`);
      return;
    }

    let lastId: string | null = null;
    let staged = 0;
    for (const file of files.slice(0, room)) {
      const check = validateMobilePhoto({ size: file.size, head: await readHead(file) });
      if (!check.ok) {
        setMediaError(check.error);
        continue;
      }
      const slot = nextPhotoSlot(draft, [...usedSlotsRef.current]);
      if (!slot) {
        setMediaError(`An Issue may carry at most ${MOBILE_MAX_PHOTOS} photos.`);
        break;
      }
      usedSlotsRef.current.add(slot);

      const itemId = crypto.randomUUID();
      const attemptId = crypto.randomUUID();
      filesRef.current.set(itemId, { blob: file, name: file.name || "photo.jpg" });
      setDraft((current) =>
        addPhoto(current, { id: itemId, slot, attemptId, previewUrl: trackObjectUrl(file) })
      );
      lastId = itemId;
      staged += 1;
      void upload(itemId, slot, attemptId);
    }

    if (files.length > room) {
      setMediaError(`Only ${MOBILE_MAX_PHOTOS} photos can be attached to one Issue.`);
    }
    // Only the camera's single capture opens a review. Gallery picks land in
    // the draft strip and leave the worker where they were.
    if (review && staged === 1 && lastId) {
      setReviewPhotoId(lastId);
      setScreen("photo");
    }
  }

  /**
   * The × on a thumbnail. Drops ONE unsent photo and nothing else.
   *
   * This is not the Edit/Retake/Reselect menu that was removed — it applies
   * only to a photo that has not been registered. The dropped asset is
   * remembered so the existing post-success cleanup can remove it; nothing is
   * deleted from Cloudinary here, and no registered media is ever touched.
   */
  function dropPhoto(id: string) {
    const photo = findPhoto(draft, id);
    if (!photo) return;
    removedAssetsRef.current.push(...photoAssets(photo));
    releaseObjectUrl(photo.previewUrl);
    filesRef.current.delete(id);
    setDraft((current) => removePhoto(current, id));
    if (reviewPhotoId === id) {
      setReviewPhotoId(null);
      setScreen("main");
    }
  }

  // ── voice ─────────────────────────────────────────────────────────────────

  /**
   * The × beside ONE unsent recording. Drops that recording and nothing else.
   *
   * The typed note, every photo and its caption, the OTHER recordings and the
   * submission id are all untouched — exactly the same contract dropPhoto()
   * has. The dropped asset is remembered so the existing post-success cleanup
   * can remove it; nothing is deleted from Cloudinary here, and no registered
   * media is ever touched.
   */
  function dropVoice(id: string) {
    const voice = findVoice(draft, id);
    if (!voice) return;
    removedAssetsRef.current.push(...voiceAssets(voice));
    releaseObjectUrl(voice.previewUrl);
    filesRef.current.delete(id);
    setDraft((current) => removeVoice(current, id));
    if (reviewVoiceId === id) {
      setReviewVoiceId(null);
      setScreen("main");
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  /**
   * The recording lands and is STAGED immediately; its review screen opens so
   * the worker can listen before sending. Registers nothing.
   *
   * SUPERSEDED: this replaced the draft's single recording and superseded the
   * previous asset. It APPENDS now — Voice 2 joins Voice 1, up to
   * MOBILE_MAX_VOICES — so the worker can record, go back, and record again,
   * and everything still leaves as ONE Issue. Each takes its own slot, uploads
   * on its own, and can be removed on its own.
   */
  async function acceptRecording(blob: Blob, name: string) {
    const check = validateMobileVoice({ size: blob.size, head: await readHead(blob) });
    if (!check.ok) {
      setMediaError(check.error);
      return;
    }
    if (!canAddVoice(draft)) {
      setMediaError(`An Issue may carry at most ${MOBILE_MAX_VOICES} voice recordings.`);
      return;
    }
    const slot = nextVoiceSlot(draft, [...usedSlotsRef.current]);
    if (!slot) {
      setMediaError("No more recordings can be added to this Issue.");
      return;
    }
    const attemptId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const previewUrl = trackObjectUrl(blob);

    usedSlotsRef.current.add(slot);
    filesRef.current.set(itemId, { blob, name });
    // Nothing is released and nothing is superseded: the earlier recordings are
    // still part of this Issue.
    setDraft((current) => addVoice(current, { id: itemId, slot, attemptId, previewUrl }));
    setReviewVoiceId(itemId);
    setScreen("voice");
    await upload(itemId, slot, attemptId);
  }

  async function startRecording() {
    setRecorderError(null);
    setMenuOpen(false);
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
        // The microphone is released the instant recording ends — it is never
        // left open between recordings.
        stopMediaTracks();
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        await acceptRecording(blob, `voice-recording.${extension}`);
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
      // The DEVICE refused, after the worker had already agreed in our own
      // sheet. Release anything half-open, keep the draft exactly as it is, and
      // say so once — no retry loop, no second prompt.
      stopMediaTracks();
      setRecording(false);
      setRecorderError(MEDIA_DENIED_MESSAGE.voice);
    }
  }

  // ── send ──────────────────────────────────────────────────────────────────

  const busy = isDraftBusy(draft) || recording;
  const summary = draftSummary(draft);
  const sendable = isDraftSendable(draft) && !busy;
  const showSend = isDraftValid(draft);

  /**
   * THE ONE SEND REQUEST — shared by the main composer, the photo review and
   * the voice review. IT WRITES NOTHING.
   *
   * It inspects the COMPLETE draft, not the screen it was called from, and
   * opens the confirmation. There is deliberately no per-screen send function:
   * a second one could construct a different payload from the one the worker
   * just reviewed.
   */
  function requestSendCurrentDraft(origin: Screen) {
    if (registering || busy) return;
    if (!isDraftSendable(draft)) return;
    setFailure(null);
    setMenuOpen(false);
    setConfirmOrigin(origin);
    setConfirming(true);
  }

  /** "Back" — closes the confirmation and leaves the worker exactly where they
   *  were, with the whole draft untouched. */
  function cancelConfirmation() {
    setConfirming(false);
    setScreen(confirmOrigin);
  }

  /**
   * THE ONE WRITE — reached only by "Yes, Send Issue".
   *
   * Registers the COMPLETE draft once, in the fixed order text → photos →
   * voice, whichever screen the send came from. Guarded against a double tap by
   * `registering`, and idempotent server-side by the submission id.
   *
   * ── AND THEN THE NEXT ISSUE IS ALREADY OPEN ─────────────────────────────
   * On success the composer does not lock and there is nothing to click: the
   * draft is emptied, a NEW submission id is minted, and the worker can start
   * typing the next Issue immediately. A registered Issue can never be sent
   * twice because its content is gone from the draft and its submission id is
   * no longer the current one.
   */
  async function confirmSend() {
    if (registering || !isDraftSendable(draft)) return;

    setConfirming(false);
    setRegistering(true);
    setFailure(null);
    try {
      const result = await registerMobileIssue({
        submissionId,
        items: draftToRegistrationItems(draft),
        superseded: draftSupersededAssets(draft, removedAssetsRef.current),
      });
      if (result.issueId) {
        // ── ONLY NOW ────────────────────────────────────────────────────────
        // The database has returned an Issue ID, so this content really has
        // been sent. Snapshot it into the session's chat history FIRST, then
        // empty the draft: the worker sees what they submitted above and a
        // clean composer beneath, rather than their old text still in the
        // input.
        //
        // The local preview URLs are deliberately NOT released — the sent
        // history is still showing them. They are freed on unmount.
        setSubmittedIssues((current) => [...current, { issueId: result.issueId!, draft }]);
        startNextIssue();
      } else {
        // The draft is deliberately kept, so the worker can send again — the
        // same submission id makes that safe.
        setFailure(result.error ?? "Could not register this Issue. Please try again.");
        setScreen(confirmOrigin);
      }
    } catch {
      setFailure("Could not register this Issue. Please try again.");
      setScreen(confirmOrigin);
    } finally {
      setRegistering(false);
    }
  }

  /**
   * Opens the NEXT Issue, in place, the instant the last one registers.
   *
   * CLIENT STATE ONLY — no reload, no router call, no navigation, and no button
   * to press. The worker stays in the same chat: everything already registered
   * remains visible above, and a ready composer sits beneath it.
   *
   * A NEW submission id is minted, which is what makes the next Issue a
   * genuinely separate registration rather than a repeat of the last one under
   * server-side idempotency. The per-submission scratch state resets with it.
   * Preview URLs are NOT revoked — the history above is still showing them.
   *
   * MEDIA CONSENT IS DELIBERATELY NOT RESET. It belongs to the session, not to
   * one Issue, so the next report does not re-explain the camera to somebody
   * who accepted the explanation two minutes ago. And nothing here opens a
   * device: starting the next Issue touches no camera, microphone or picker.
   */
  function startNextIssue() {
    setSubmissionId(crypto.randomUUID());
    setDraft(emptyIssueDraft());
    setReviewPhotoId(null);
    setReviewVoiceId(null);
    setFailure(null);
    setMediaError(null);
    setRecorderError(null);
    setScreen("main");
    usedSlotsRef.current = new Set();
    removedAssetsRef.current = [];
    filesRef.current = new Map();
  }

  // ── render ────────────────────────────────────────────────────────────────

  const reviewPhoto = findPhoto(draft, reviewPhotoId);
  const reviewVoice = findVoice(draft, reviewVoiceId);
  const showNotice = submittedIssues.length === 0 && !failure;
  const photosLeft = MOBILE_MAX_PHOTOS - photoCount(draft);
  const voicesLeft = MOBILE_MAX_VOICES - voiceCount(draft);

  /** The confirmation, identical wherever Send was pressed. */
  // ── MEDIA CONSENT SHEET ──────────────────────────────────────────────────
  // One component, three kinds. It renders above the bottom bar and does not
  // replace it, so the worker can still see the draft they are protecting.
  //
  // Nothing here touches a device. The confirm button is the ONLY place a
  // camera, gallery or microphone is opened from, and it closes the sheet
  // before it does so — consent is never held after the tap that used it.
  const consentPrompt = consent ? mediaConsentPrompt(consent) : null;

  const consentSheet = consentPrompt && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-consent-title"
      className="border-t border-neutral-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <p
        id="media-consent-title"
        className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50"
      >
        {consentPrompt.title}
      </p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{consentPrompt.body}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={declineConsent}
          className="flex flex-1 items-center justify-center rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 active:scale-[0.99] transition-transform dark:border-neutral-700 dark:text-neutral-200"
        >
          {consentPrompt.cancelLabel}
        </button>
        <button
          type="button"
          onClick={acceptConsent}
          className="flex flex-[1.4] items-center justify-center rounded-xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white active:scale-[0.99] transition-transform dark:bg-neutral-100 dark:text-neutral-900"
        >
          {consentPrompt.confirmLabel}
        </button>
      </div>
    </div>
  );

  const confirmation = (
    <div className="border-t border-neutral-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">
        Ready to send?
      </p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        Please check everything is correct.
        <br />
        Once sent, this Issue will be registered.
      </p>
      {/* Only what the draft actually holds. */}
      <ul className="mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {summary.hasText && <li>Text ✓</li>}
        {summary.photos > 0 && <li>Photos: {summary.photos}</li>}
        {/* A count, not a tick: the worker is about to send several. */}
        {summary.voices > 0 && <li>Voice notes: {summary.voices}</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={cancelConfirmation}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 active:scale-[0.99] transition-transform dark:border-neutral-700 dark:text-neutral-200"
        >
          <BackIcon className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={() => void confirmSend()}
          disabled={registering}
          aria-label="Yes, Send Issue"
          className="flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white active:scale-[0.99] transition-transform disabled:opacity-50"
        >
          {registering ? <SpinnerIcon className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
          Yes, Send Issue
        </button>
      </div>
    </div>
  );

  const sendButton = (origin: Screen) => (
    <button
      type="button"
      onClick={() => requestSendCurrentDraft(origin)}
      disabled={!sendable}
      aria-label="Send Issue"
      className={`${roundButtonClassName} bg-emerald-600 text-white`}
    >
      <SendIcon className="h-5 w-5" />
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Hidden pickers. The CAMERA takes one photo and opens its review; the
          GALLERY takes several and puts them straight in the draft. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg"
        capture="environment"
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) await stagePhotos(files, true);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg"
        multiple
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          // No review screen, however many were picked.
          if (files.length > 0) await stagePhotos(files, false);
        }}
      />

      {/* ── BODY: the draft, or a review of one part of it ──────────────── */}
      {screen === "photo" && reviewPhoto ? (
        <PhotoReviewBody
          photo={reviewPhoto}
          index={photoIndex(draft, reviewPhoto.id)}
          total={photoCount(draft)}
          // Looks at a different photo. Nothing else: no upload, no caption
          // move, no reordering, no registration.
          onStep={(step) => {
            const neighbour = adjacentPhotoId(draft, reviewPhoto.id, step);
            if (neighbour) setReviewPhotoId(neighbour);
          }}
        />
      ) : screen === "voice" && reviewVoice ? (
        <VoiceReviewBody
          voice={reviewVoice}
          index={voiceIndex(draft, reviewVoice.id)}
          total={voiceCount(draft)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" style={chatBackground}>
          <div className="flex flex-col gap-2.5">
            {showNotice && (
              <div className="mx-auto mt-6 max-w-[85%] rounded-2xl bg-white/85 px-4 py-3 text-center shadow-sm dark:bg-neutral-900/85">
                <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                  Tell us what happened
                </p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Add a note, photos or a voice message. Send when you&rsquo;re ready.
                </p>
              </div>
            )}

            {/* NOTHING about the unsent draft is rendered here. Text, photos
                and the recording live in the draft tray above the composer
                until the Issue is actually registered — see the root-cause
                note at the top of this file. This area carries only the
                information notice and, afterwards, the real outcome. */}

            {/* ── THE SESSION'S REGISTERED ISSUES ─────────────────────────
                Each one reads as a short exchange: what the worker sent, on
                the right, and the system's reply confirming it, on the left.
                Every part is READ-ONLY — no ×, no add-more, no caption field,
                no retry, no send. Those belong to a draft, and these are not
                drafts any more. */}
            {submittedIssues.map((issue, index) => (
              <Fragment key={`${issue.issueId}-${index}`}>
                {hasMeaningfulText(issue.draft.text) && (
                  <div className="flex justify-end">
                    <div className={sentBubbleClassName}>
                      <p className="whitespace-pre-wrap break-words">{issue.draft.text}</p>
                    </div>
                  </div>
                )}

                {issue.draft.photos.map((photo) => (
                  <div key={photo.id} className="flex justify-end">
                    <div className={sentBubbleClassName}>
                      {photo.previewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.previewUrl}
                          alt="Sent evidence photo"
                          className="max-h-56 w-full rounded-xl object-contain"
                        />
                      )}
                      {photo.caption && (
                        <p className="mt-1.5 whitespace-pre-wrap break-words">{photo.caption}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Every recording that went with this Issue, in order, each
                    its own bubble and its own independent player. */}
                {issue.draft.voices.map((voice, voiceNumber) =>
                  voice.previewUrl ? (
                    <div key={voice.id} className="flex justify-end">
                      <div className={sentBubbleClassName}>
                        <audio
                          controls
                          preload="metadata"
                          src={voice.previewUrl}
                          className="w-full"
                          aria-label={`Play back voice note ${voiceNumber + 1} you sent`}
                        />
                      </div>
                    </div>
                  ) : null
                )}

                {/* The reply. Compact, incoming, never a card in the middle. */}
                <div className="flex justify-start">
                  <div role="status" className={replyBubbleClassName}>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckIcon className="h-4 w-4" />
                      Issue Registered
                    </p>
                    <p className="mt-0.5 text-[15px] font-bold tracking-tight">
                      Issue ID: {issue.issueId}
                    </p>
                    {/* No follow-up button here: the composer below is already
                        a fresh, enabled Issue. Nothing to click. */}
                  </div>
                </div>
              </Fragment>
            ))}

            {/* A failure is a reply too — and the draft below is untouched. */}
            {failure && (
              <div className="flex justify-start">
                <div role="alert" className={replyBubbleClassName}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
                    <AlertIcon className="h-4 w-4" />
                    Registration Failed
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">{failure}</p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Your issue draft has been kept.
                  </p>
                </div>
              </div>
            )}


            {(mediaError || recorderError) && (
              <p
                role="alert"
                className="mx-auto flex max-w-[90%] items-start gap-2 rounded-2xl bg-white px-3 py-2.5 text-sm text-red-700 shadow-sm dark:bg-neutral-900 dark:text-red-300"
              >
                <AlertIcon className="mt-0.5 h-4 w-4" />
                <span>{recorderError ?? mediaError}</span>
              </p>
            )}

            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* ── ATTACHMENT MENU ────────────────────────────────────────────── */}
      {menuOpen && !confirming && !consent && screen === "main" && (
        <div className="border-t border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
          {/* Only what this application actually supports. Generic files are
              not accepted by lib/access/attachments.ts. */}
          <button type="button" onClick={openGallery} disabled={!canAddPhoto(draft)} className={menuRowClassName}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">
              <GalleryIcon className="h-5 w-5" />
            </span>
            Gallery
          </button>
          <button type="button" onClick={openCamera} disabled={!canAddPhoto(draft)} className={menuRowClassName}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
              <CameraIcon className="h-5 w-5" />
            </span>
            Camera
          </button>
          {/* Hidden entirely at the cap — there is nothing useful behind it. */}
          {canAddVoice(draft) && (
            <button
              type="button"
              onClick={openVoice}
              disabled={!recordingSupported}
              className={menuRowClassName}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                <MicrophoneIcon className="h-5 w-5" />
              </span>
              Voice
            </button>
          )}
          <p className="px-3 pb-1 pt-1 text-xs text-neutral-400 dark:text-neutral-500">
            {photosLeft} of {MOBILE_MAX_PHOTOS} photos left · {voicesLeft} of{" "}
            {MOBILE_MAX_VOICES} voice notes left
          </p>
        </div>
      )}

      {/* ── DRAFT TRAY — the UNSENT Issue, attached to the composer ─────── */}
      {/* Photo thumbnails and the recording sit HERE, immediately above the
          input, so the whole Issue reads as one thing that has not been sent.
          Rendering them in the timeline made them look already delivered. */}
      {screen === "main" && (photoCount(draft) > 0 || voiceCount(draft) > 0) && (
        <div className="border-t border-neutral-200 bg-white px-2 pt-2 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Not sent yet
          </p>

          {photoCount(draft) > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {draft.photos.map((photo) => (
                <div key={photo.id} className="relative h-16 w-16 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewPhotoId(photo.id);
                      setScreen("photo");
                    }}
                    aria-label="Open photo"
                    className="h-full w-full overflow-hidden rounded-xl border border-neutral-200 active:scale-95 transition-transform dark:border-neutral-700"
                  >
                    {photo.previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.previewUrl}
                        alt="Selected evidence photo"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {/* Each photo carries its OWN state: several can upload at
                        once and finish independently. */}
                    {photo.status === "uploading" && (
                      <span
                        title="Uploading…"
                        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-black/45 text-white"
                      >
                        <SpinnerIcon className="h-4 w-4" />
                        <span className="text-[9px] font-semibold">Uploading…</span>
                      </span>
                    )}
                    {photo.status === "failed" && (
                      <span
                        title="Upload failed"
                        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-red-600/75 text-white"
                      >
                        <AlertIcon className="h-4 w-4" />
                        <span className="text-[9px] font-semibold">Failed</span>
                      </span>
                    )}
                    {/* A caption is indicated, not printed — the strip stays small. */}
                    {photo.caption && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[9px] font-semibold text-white">
                        caption
                      </span>
                    )}
                  </button>
                  {/* Drops THIS photo from the unsent draft. Nothing else. */}
                  <button
                    type="button"
                    onClick={() => dropPhoto(photo.id)}
                    aria-label="Remove photo"
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-neutral-900 text-white shadow active:scale-90 transition-transform dark:border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {/* Straight to the gallery for more photos. Hidden at the cap. */}
              {canAddPhoto(draft) && (
                <button
                  type="button"
                  onClick={openGallery}
                  aria-label="Add photos"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-neutral-500 active:scale-95 transition-transform dark:border-neutral-600 dark:text-neutral-400"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          )}

          {!canAddPhoto(draft) && (
            <p className="px-1 pb-2 text-[11px] text-neutral-400 dark:text-neutral-500">
              Maximum {MOBILE_MAX_PHOTOS} photos.
            </p>
          )}

          {/* ── UNSENT RECORDINGS ─────────────────────────────────────────
              One compact row per recording — "▶ Voice 1 ×". Each plays on its
              own, uploads on its own, and is removed on its own; removing one
              touches neither the text, nor the photos, nor the others, nor the
              submission id. */}
          {draft.voices.map((voice, index) => (
            <div key={voice.id} className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReviewVoiceId(voice.id);
                  setScreen("voice");
                }}
                aria-label={`Open voice note ${index + 1}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left dark:border-neutral-700"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                  <MicrophoneIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-xs font-medium text-neutral-700 dark:text-neutral-200">
                  Voice {index + 1}
                  {voice.status === "uploading" && " — uploading…"}
                  {voice.status === "failed" && " — upload failed"}
                </span>
                {voice.previewUrl && voice.status !== "uploading" && (
                  <audio
                    controls
                    preload="metadata"
                    src={voice.previewUrl}
                    className="h-8 max-w-[55%]"
                    aria-label={`Play back voice note ${index + 1}`}
                    onClick={(event) => event.stopPropagation()}
                  />
                )}
              </button>
              {/* Drops THIS recording from the unsent draft. Nothing else. */}
              <button
                type="button"
                onClick={() => dropVoice(voice.id)}
                aria-label={`Remove voice note ${index + 1}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white bg-neutral-900 text-white shadow active:scale-90 transition-transform dark:border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {!canAddVoice(draft) && (
            <p className="px-1 pb-2 text-[11px] text-neutral-400 dark:text-neutral-500">
              Maximum {MOBILE_MAX_VOICES} voice notes.
            </p>
          )}
        </div>
      )}

      {/* ── BOTTOM BAR ─────────────────────────────────────────────────── */}
      {/* The consent sheet takes precedence over every bar variant: while it is
          open the question is the only thing to answer. It never replaces the
          send confirmation, because media buttons are not reachable from
          there. */}
      {consentSheet ? (
        consentSheet
      ) : confirming ? (
        confirmation
      ) : screen === "photo" && reviewPhoto ? (
        /* Caption + Send. No Add Photo: the photo is already in the Issue. */
        <div className={barClassName}>
          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => setScreen("main")}
              aria-label="Back to issue"
              className={`${roundButtonClassName} text-neutral-600 dark:text-neutral-300`}
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <input
              type="text"
              value={reviewPhoto.caption ?? ""}
              maxLength={MOBILE_MAX_CAPTION_LENGTH}
              onChange={(event) =>
                setDraft((current) => setPhotoCaption(current, reviewPhoto.id, event.target.value))
              }
              placeholder="Add a caption..."
              aria-label="Add a caption"
              className={textInputClassName}
            />
            {sendButton("photo")}
          </div>
          {/* A photo whose upload failed would otherwise be a dead end: it
              blocks Send, and this version offers no way to replace it. The
              same retry the draft already had, reached from the photo. */}
          {reviewPhoto.status === "failed" && (
            <button
              type="button"
              onClick={() => void retry(reviewPhoto.id, reviewPhoto.slot, reviewPhoto.attemptId)}
              className="mt-2 flex items-center gap-1.5 px-3 text-xs font-semibold text-red-600 dark:text-red-400"
            >
              <RetryIcon className="h-3.5 w-3.5" />
              {reviewPhoto.error ?? "Upload failed."} Retry upload
            </button>
          )}
          <p className="px-3 pt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {busy
              ? "Uploading your evidence… you can send as soon as it finishes."
              : "Send registers this Issue with everything you have added."}
          </p>
        </div>
      ) : screen === "voice" && reviewVoice ? (
        <div className={barClassName}>
          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => setScreen("main")}
              aria-label="Back to issue"
              className={`${roundButtonClassName} text-neutral-600 dark:text-neutral-300`}
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <p className="min-w-0 flex-1 px-2 text-sm text-neutral-600 dark:text-neutral-300">
              {reviewVoice.status === "uploading" ? "Uploading…" : "Recording ready."}
            </p>
            {sendButton("voice")}
          </div>
          {/* Same dead end as a failed photo, same way out. Retrying THIS
              recording touches no other recording's upload. */}
          {reviewVoice.status === "failed" && (
            <button
              type="button"
              onClick={() => void retry(reviewVoice.id, reviewVoice.slot, reviewVoice.attemptId)}
              className="mt-2 flex items-center gap-1.5 px-3 text-xs font-semibold text-red-600 dark:text-red-400"
            >
              <RetryIcon className="h-3.5 w-3.5" />
              {reviewVoice.error ?? "Upload failed."} Retry upload
            </button>
          )}
          <p className="px-3 pt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Send registers this Issue with everything you have added.
          </p>
        </div>
      ) : (
        <div className={barClassName}>
          {recording ? (
            <div className="flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 dark:bg-red-950/40">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="flex-1 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                Recording {formatDuration(seconds)} / {formatDuration(MOBILE_MAX_RECORDING_SECONDS)}
              </span>
              <button
                type="button"
                onClick={stopRecording}
                aria-label="Stop Recording"
                className={`${roundButtonClassName} bg-red-600 text-white`}
              >
                <StopIcon className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              {busy && (
                <p className="px-3 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Uploading your evidence… you can send as soon as it finishes.
                </p>
              )}
              <div className="flex items-end gap-1">
                {/* ALWAYS available, in every state. */}
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-label="Add media"
                  aria-expanded={menuOpen}
                  className={`${roundButtonClassName} text-neutral-600 dark:text-neutral-300`}
                >
                  <PlusIcon className="h-6 w-6" />
                </button>

                <input
                  type="text"
                  value={draft.text}
                  maxLength={MOBILE_MAX_TEXT_LENGTH}
                  onChange={(event) =>
                    setDraft((current) => setDraftText(current, event.target.value))
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    requestSendCurrentDraft("main");
                  }}
                  placeholder="Write issue details..."
                  aria-label="Write issue details"
                  className={textInputClassName}
                />

                {/* SUPERSEDED: these used to be swapped out for the send
                    control the moment the worker typed anything, which meant a
                    note blocked the camera and the microphone — exactly the
                    combination the whole screen exists to support. They are
                    permanent now, and send simply joins them when there is
                    something to register. Each is gated only by its own real
                    limit: ten photos, and a device that can record. */}
                <button
                  type="button"
                  onClick={openCamera}
                  disabled={!canAddPhoto(draft)}
                  aria-label="Take photo"
                  className={`${roundButtonClassName} text-neutral-600 dark:text-neutral-300`}
                >
                  <CameraIcon className="h-5 w-5" />
                </button>
                {/* Gone at five recordings — the cap is a real limit, not a
                    disabled button the worker keeps pressing. */}
                {canAddVoice(draft) && (
                  <button
                    type="button"
                    onClick={openVoice}
                    disabled={!recordingSupported}
                    aria-label="Record voice"
                    className={`${roundButtonClassName} text-neutral-600 dark:text-neutral-300`}
                  >
                    <MicrophoneIcon className="h-5 w-5" />
                  </button>
                )}
                {showSend && sendButton("main")}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
