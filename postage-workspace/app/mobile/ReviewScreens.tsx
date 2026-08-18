"use client";

import type { PhotoDraft, VoiceDraft } from "@/lib/mobile/mobileDraft";
import { BackIcon, ForwardIcon, RetryIcon, SpinnerIcon } from "./icons";

// WAREHOUSE MOBILE LITE — the review bodies.
//
// A photo or a recording is STAGED IN THE DRAFT the moment it is taken or
// picked. These screens are therefore a review of something that is already
// part of the Issue — not a staging step with its own "add" action. There is
// deliberately no Add Photo / Add Voice control anywhere: the only forward
// action is Send, and Send always means "register the whole Issue".
//
// Presentational only: no upload, no draft mutation, no registration.

const arrowClassName =
  "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white active:scale-90 transition-transform disabled:opacity-0 disabled:pointer-events-none";

/**
 * @param index  0-based position of this photo in the draft.
 * @param total  how many photos the draft holds.
 * @param onStep called with -1 or 1. PURE NAVIGATION — the parent only changes
 *               which photo is being looked at. Nothing re-uploads, no caption
 *               moves and no order changes.
 */
export function PhotoReviewBody({
  photo,
  index,
  total,
  onStep,
}: {
  photo: PhotoDraft;
  index: number;
  total: number;
  onStep: (step: -1 | 1) => void;
}) {
  // A single photo has nowhere to go, so it gets no arrows and no counter.
  const canNavigate = total > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
      <div className="flex items-center gap-2 pb-2">
        <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">Photo</p>
        {canNavigate && (
          <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold tabular-nums text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {index + 1} / {total}
          </span>
        )}
        <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
          {photo.status === "uploading" && (
            <span className="flex items-center gap-1">
              <SpinnerIcon className="h-3 w-3" />
              Uploading…
            </span>
          )}
          {photo.status === "uploaded" && "Ready"}
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-neutral-900">
        {/* A local object URL for the exact captured file — next/image cannot
            optimise a blob: URL and no remote fetch is wanted here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.previewUrl ?? ""}
          alt={canNavigate ? `Selected evidence photo ${index + 1} of ${total}` : "Selected evidence photo"}
          className="max-h-[55vh] w-full object-contain"
        />

        {/* Over the image, so they cost no vertical space on a small screen.
            Each is hidden at its end of the strip rather than left dangling. */}
        {canNavigate && (
          <>
            <button
              type="button"
              onClick={() => onStep(-1)}
              disabled={index <= 0}
              aria-label="Previous photo"
              className={`${arrowClassName} left-2`}
            >
              <BackIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={index >= total - 1}
              aria-label="Next photo"
              className={`${arrowClassName} right-2`}
            >
              <ForwardIcon className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {photo.status === "failed" && (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
          <RetryIcon className="h-3.5 w-3.5" />
          {photo.error ?? "Upload failed."}
        </p>
      )}
    </div>
  );
}

export function VoiceReviewBody({ voice }: { voice: VoiceDraft }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-4 pb-2 pt-2">
      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="flex items-center gap-2 pb-2">
          <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">
            Voice recording
          </p>
          <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
            {voice.status === "uploading" && (
              <span className="flex items-center gap-1">
                <SpinnerIcon className="h-3 w-3" />
                Uploading…
              </span>
            )}
            {voice.status === "uploaded" && "Ready"}
          </span>
        </div>
        {voice.previewUrl && (
          <audio
            controls
            preload="metadata"
            src={voice.previewUrl}
            className="w-full"
            aria-label="Play back your voice recording"
          />
        )}
        {voice.status === "failed" && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
            <RetryIcon className="h-3.5 w-3.5" />
            {voice.error ?? "Upload failed."}
          </p>
        )}
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          This recording is already part of your Issue. Send registers everything you have added.
        </p>
      </div>
    </div>
  );
}
