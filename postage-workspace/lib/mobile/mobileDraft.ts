import {
  MOBILE_MAX_PHOTOS,
  MOBILE_MAX_VOICES,
  MOBILE_VOICE_SLOT_COUNT,
  mobilePhotoSlot,
  mobileVoiceSlot,
  type MobileUploadSlot,
} from "./mobileAccess";
import type { UploadedAsset } from "./mobileSlots";
import type { MobileTimelineInput } from "./mobileRegistration";

// WAREHOUSE MOBILE LITE — STAGE 2: the PURE Issue Draft.
//
// ── ONE SCREEN IS ONE ISSUE ─────────────────────────────────────────────────
// The /mobile screen is not a conversation. It is ONE Issue being prepared:
//
//     IssueDraft { text, photos[], voices[] }
//
// The UI is chat-styled because that is what a warehouse worker already knows,
// but there are no messages, no chat backend and no message table. There is a
// draft, and there is one registration.
//
// ── WHY A RECORD AND NOT AN ORDERED LIST ────────────────────────────────────
// SUPERSEDED: an earlier revision modelled the draft as an ordered list of
// timeline items with the composer's typed text held separately until send.
// Manual UAT found the consequence: text typed BEFORE a photo was appended
// AFTER it, so the description came out reversed, and the screen looked as
// though it had become a photo-only report. Shaping the draft as text + photos
// + voices removes the question entirely — the registration order is fixed
// (§26): worker text, then photos in the order added, then the recordings in
// the order they were made.
//
// No React, no `server-only`, no network: every rule here is directly
// unit-testable without rendering anything.

export type MediaStatus = "uploading" | "uploaded" | "failed";

/** What every piece of evidence carries while it is being prepared. */
interface MediaDraftBase {
  id: string;
  /** Fixed for the life of the item — a replacement changes only the attempt. */
  slot: MobileUploadSlot;
  attemptId: string;
  status: MediaStatus;
  asset: UploadedAsset | null;
  /** Local object URL for instant preview/playback. Never registered. */
  previewUrl: string | null;
  error: string | null;
  /** Assets replaced by a later deliberate attempt on THIS item. */
  superseded: UploadedAsset[];
}

export interface PhotoDraft extends MediaDraftBase {
  /** Optional, set once on the photo review screen. Null, never "". */
  caption: string | null;
}

export type VoiceDraft = MediaDraftBase;

export interface IssueDraft {
  /** Exactly what is in the composer input. It IS the worker's text. */
  text: string;
  photos: PhotoDraft[];
  /** SUPERSEDED: this was `voice: VoiceDraft | null`, and a second recording
   *  replaced the first. It is a LIST now — up to MOBILE_MAX_VOICES of them, in
   *  the order they were recorded — so a worker can step away between takes and
   *  still send everything as ONE Issue. */
  voices: VoiceDraft[];
}

export function emptyIssueDraft(): IssueDraft {
  return { text: "", photos: [], voices: [] };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** True only for text that would survive server-side normalisation. */
export function hasMeaningfulText(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The composer input, which is the draft's text. There is no separate "commit"
 * step and nothing to lose: opening the camera, the gallery or the microphone
 * does not touch this field, so the text is still here when the worker returns.
 */
export function setDraftText(draft: IssueDraft, text: string): IssueDraft {
  return { ...draft, text };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export function photoCount(draft: IssueDraft): number {
  return draft.photos.length;
}

export function canAddPhoto(draft: IssueDraft): boolean {
  return draft.photos.length < MOBILE_MAX_PHOTOS;
}

/**
 * The next free photo slot.
 *
 * Slots are never recycled within a submission: a removed photo's slot stays
 * used, because its Cloudinary asset still exists under that path and reusing
 * the name would collide with `overwrite=false`. Returns null once all ten are
 * spent.
 */
export function nextPhotoSlot(
  draft: IssueDraft,
  usedSlots: readonly string[] = []
): MobileUploadSlot | null {
  const taken = new Set<string>([...usedSlots, ...draft.photos.map((photo) => photo.slot)]);
  for (let index = 1; index <= MOBILE_MAX_PHOTOS; index++) {
    const slot = mobilePhotoSlot(index);
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/** Appends a photo. The caption travels with it from this moment on. */
export function addPhoto(
  draft: IssueDraft,
  input: {
    id: string;
    slot: MobileUploadSlot;
    attemptId: string;
    caption?: string | null;
    previewUrl?: string | null;
  }
): IssueDraft {
  if (!canAddPhoto(draft)) return draft;
  const caption =
    typeof input.caption === "string" && input.caption.trim().length > 0
      ? input.caption.trim()
      : null;
  return {
    ...draft,
    photos: [
      ...draft.photos,
      {
        id: input.id,
        slot: input.slot,
        attemptId: input.attemptId,
        status: "uploading",
        asset: null,
        caption,
        previewUrl: input.previewUrl ?? null,
        error: null,
        superseded: [],
      },
    ],
  };
}

/** The caption for ONE staged photo. Typed on the review screen after the
 *  photo is already part of the draft, so it never gates the upload. */
export function setPhotoCaption(draft: IssueDraft, id: string, caption: string): IssueDraft {
  const trimmed = typeof caption === "string" ? caption.trim() : "";
  return {
    ...draft,
    photos: draft.photos.map((photo) =>
      photo.id === id ? { ...photo, caption: trimmed.length > 0 ? trimmed : null } : photo
    ),
  };
}

export function findPhoto(draft: IssueDraft, id: string | null): PhotoDraft | null {
  if (!id) return null;
  return draft.photos.find((photo) => photo.id === id) ?? null;
}

/** Where a photo sits in the strip, 0-based. -1 when it is not in the draft. */
export function photoIndex(draft: IssueDraft, id: string | null): number {
  if (!id) return -1;
  return draft.photos.findIndex((photo) => photo.id === id);
}

/**
 * The photo one step either side of the one being reviewed, for the Previous /
 * Next arrows. Returns null at each end, which is what disables the arrow.
 *
 * PURE NAVIGATION. It only picks a different id to look at: the order is never
 * changed, no upload is started or repeated, no caption moves, and nothing is
 * registered. Each photo keeps its own state and its own caption because
 * neither is touched.
 */
export function adjacentPhotoId(
  draft: IssueDraft,
  id: string | null,
  step: -1 | 1
): string | null {
  const index = photoIndex(draft, id);
  if (index === -1) return null;
  const next = index + step;
  if (next < 0 || next >= draft.photos.length) return null;
  return draft.photos[next].id;
}

/**
 * Drops ONE staged photo from the UNSENT draft — the × on its thumbnail.
 *
 * Touches nothing else: the text, the other photos and the recording are all
 * untouched, and the submission id is unchanged. Nothing is deleted from
 * Cloudinary here either; the caller collects the dropped asset so the existing
 * post-success cleanup can remove it, exactly as a superseded asset.
 *
 * Deliberately narrow: this is not the Edit/Retake/Reselect menu that was
 * removed. It applies only to a photo that has not been registered yet.
 */
export function removePhoto(draft: IssueDraft, id: string): IssueDraft {
  return { ...draft, photos: draft.photos.filter((photo) => photo.id !== id) };
}

/** Every asset a dropped photo was holding, for that cleanup. */
export function photoAssets(photo: PhotoDraft): UploadedAsset[] {
  return photo.asset ? [...photo.superseded, photo.asset] : [...photo.superseded];
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export function hasVoice(draft: IssueDraft): boolean {
  return draft.voices.length > 0;
}

export function voiceCount(draft: IssueDraft): number {
  return draft.voices.length;
}

export function canAddVoice(draft: IssueDraft): boolean {
  return draft.voices.length < MOBILE_MAX_VOICES;
}

/**
 * The next free voice slot.
 *
 * Slots are never recycled within a submission, for exactly the reason photo
 * slots are not: a removed recording's Cloudinary asset still exists under that
 * path and uploads are signed `overwrite=false`, so reusing the name would
 * return the OLD audio.
 *
 * There are MORE slots than the five-recording cap on purpose, so removing a
 * staged recording and making another one does not eat into the worker's
 * allowance — see MOBILE_VOICE_SLOT_COUNT. Returns null once every name is
 * spent.
 */
export function nextVoiceSlot(
  draft: IssueDraft,
  usedSlots: readonly string[] = []
): MobileUploadSlot | null {
  const taken = new Set<string>([...usedSlots, ...draft.voices.map((voice) => voice.slot)]);
  for (let index = 1; index <= MOBILE_VOICE_SLOT_COUNT; index++) {
    const slot = mobileVoiceSlot(index);
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/**
 * APPENDS a recording.
 *
 * SUPERSEDED: setVoice() replaced the draft's single recording and pushed the
 * previous asset onto `superseded`. Nothing is replaced now — Voice 2 joins
 * Voice 1, and both are registered on the same Issue in the order they were
 * recorded. A recording is dropped only by the worker pressing its own ×.
 */
export function addVoice(
  draft: IssueDraft,
  input: { id: string; slot: MobileUploadSlot; attemptId: string; previewUrl?: string | null }
): IssueDraft {
  if (!canAddVoice(draft)) return draft;
  return {
    ...draft,
    voices: [
      ...draft.voices,
      {
        id: input.id,
        slot: input.slot,
        attemptId: input.attemptId,
        status: "uploading",
        asset: null,
        previewUrl: input.previewUrl ?? null,
        error: null,
        superseded: [],
      },
    ],
  };
}

export function findVoice(draft: IssueDraft, id: string | null): VoiceDraft | null {
  if (!id) return null;
  return draft.voices.find((voice) => voice.id === id) ?? null;
}

/** Where a recording sits among the recordings, 0-based. -1 when absent. */
export function voiceIndex(draft: IssueDraft, id: string | null): number {
  if (!id) return -1;
  return draft.voices.findIndex((voice) => voice.id === id);
}

/**
 * Drops ONE staged recording from the UNSENT draft — the × beside it.
 *
 * Touches nothing else: the text, the photos, their captions, the OTHER
 * recordings and the submission id are all untouched. Nothing is deleted from
 * Cloudinary here; the caller collects the dropped asset so the existing
 * post-success cleanup can remove it, exactly as a superseded asset.
 */
export function removeVoice(draft: IssueDraft, id: string): IssueDraft {
  return { ...draft, voices: draft.voices.filter((voice) => voice.id !== id) };
}

/** Every asset a dropped recording was holding, for that cleanup. */
export function voiceAssets(voice: VoiceDraft): UploadedAsset[] {
  return voice.asset ? [...voice.superseded, voice.asset] : [...voice.superseded];
}

// ---------------------------------------------------------------------------
// Upload state
// ---------------------------------------------------------------------------

function mapMedia(draft: IssueDraft, id: string, change: (media: MediaDraftBase) => MediaDraftBase) {
  const photos = draft.photos.map((photo) =>
    photo.id === id ? ({ ...photo, ...change(photo) } as PhotoDraft) : photo
  );
  // Only the matching recording is rebuilt. Every other voice keeps its own
  // object identity, its own status and its own error — which is what makes one
  // upload failure isolated to the recording it belongs to.
  const voices = draft.voices.map((voice) =>
    voice.id === id ? ({ ...voice, ...change(voice) } as VoiceDraft) : voice
  );
  return { ...draft, photos, voices };
}

export function mediaUploaded(draft: IssueDraft, id: string, asset: UploadedAsset): IssueDraft {
  return mapMedia(draft, id, (media) => ({ ...media, status: "uploaded", asset, error: null }));
}

export function mediaFailed(draft: IssueDraft, id: string, error: string): IssueDraft {
  return mapMedia(draft, id, (media) => ({ ...media, status: "failed", error }));
}

/** Retry of the SAME failed attempt: the attemptId is deliberately kept, so the
 *  same public_id is reused and no duplicate asset appears. */
export function retryMedia(draft: IssueDraft, id: string): IssueDraft {
  return mapMedia(draft, id, (media) =>
    media.status === "failed" ? { ...media, status: "uploading", error: null } : media
  );
}

/** Every media item in the draft, photos first then the recordings in order. */
export function allMedia(draft: IssueDraft): MediaDraftBase[] {
  return [...draft.photos, ...draft.voices];
}

export function isDraftBusy(draft: IssueDraft): boolean {
  return allMedia(draft).some((media) => media.status === "uploading");
}

/** Assets replaced during this report. Passed to registration, which re-checks
 *  each against this submission's namespace before deleting it — and only AFTER
 *  the Issue is safely committed. */
export function draftSupersededAssets(
  draft: IssueDraft,
  removed: readonly UploadedAsset[] = []
): UploadedAsset[] {
  return [...removed, ...allMedia(draft).flatMap((media) => media.superseded)];
}

// ---------------------------------------------------------------------------
// Validity and registration
// ---------------------------------------------------------------------------

/**
 * A draft is worth registering when it holds AT LEAST ONE meaningful thing.
 *
 * Text alone, a photo alone and a recording alone are each a complete Issue.
 * Nothing is mandatory, and no combination is privileged.
 */
export function isDraftValid(draft: IssueDraft): boolean {
  return hasMeaningfulText(draft.text) || draft.photos.length > 0 || draft.voices.length > 0;
}

/** Valid, nothing in flight, and every attached asset actually landed. */
export function isDraftSendable(draft: IssueDraft): boolean {
  if (!isDraftValid(draft)) return false;
  return allMedia(draft).every((media) => media.status === "uploaded" && media.asset !== null);
}

/** What the confirmation shows. Only what is actually present. */
export function draftSummary(draft: IssueDraft): {
  hasText: boolean;
  photos: number;
  /** SUPERSEDED: `hasVoice: boolean`. A count, now that a report may carry
   *  several, so the confirmation states how many are about to be sent. */
  voices: number;
} {
  return {
    hasText: hasMeaningfulText(draft.text),
    photos: draft.photos.length,
    voices: draft.voices.length,
  };
}

/** The stable id the worker's text registers under. */
export const DRAFT_TEXT_ID = "issue-text";

/**
 * The adapter onto the EXISTING Stage 2 registration contract.
 *
 * Deterministic order, per the product rule: worker text, then photos in the
 * order they were added, then the recordings in the order they were made. Each
 * photo keeps its own caption.
 * Local preview URLs, attempt ids, statuses and superseded history are
 * deliberately NOT sent — none of them is part of the stored record.
 *
 * Only what exists is included: nothing is invented to fill a gap.
 */
export function draftToRegistrationItems(draft: IssueDraft): MobileTimelineInput[] {
  const items: MobileTimelineInput[] = [];

  if (hasMeaningfulText(draft.text)) {
    items.push({ id: DRAFT_TEXT_ID, kind: "text", text: draft.text.trim() });
  }

  for (const photo of draft.photos) {
    if (!photo.asset) continue;
    items.push({
      id: photo.id,
      kind: "image",
      slot: photo.slot,
      asset: {
        publicId: photo.asset.publicId,
        secureUrl: photo.asset.secureUrl,
        bytes: photo.asset.bytes,
        format: photo.asset.format,
        resourceType: photo.asset.resourceType,
      },
      caption: photo.caption,
    });
  }

  // Every recording, in the order it was made — Voice 1 first. The order is the
  // draft's order, so what the manager plays back matches what the worker said.
  for (const voice of draft.voices) {
    if (!voice.asset) continue;
    items.push({
      id: voice.id,
      kind: "voice",
      slot: voice.slot,
      asset: {
        publicId: voice.asset.publicId,
        secureUrl: voice.asset.secureUrl,
        bytes: voice.asset.bytes,
        format: voice.asset.format,
        resourceType: voice.asset.resourceType,
      },
    });
  }

  return items;
}
