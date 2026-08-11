"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Small floating popover for the "+N" overflow indicator in the
// Coordinator/Members table cell. Opens on hover OR keyboard focus, closes
// when both the trigger AND the popover itself are no longer hovered/focused
// — never on page navigation, and never expands the table row itself.
// UI-only: renders names already fetched for the row, never fetches or
// mutates anything.
//
// Rendered via a portal into document.body, positioned with `position:
// fixed` computed from the trigger's own on-screen coordinates. This is
// deliberate: a plain `position: absolute` popover nested inside a table
// cell can still influence that cell's auto-layout width/height in some
// browsers' table-layout intrinsic-sizing pass (the cell's "shrink-to-fit"
// calculation isn't guaranteed to fully ignore positioned descendants the
// way it does outside a table). Portaling to <body> removes the popover
// from the table's DOM subtree entirely, so it is structurally impossible
// for it to affect any row height, column width, or table dimension —
// zero layout shift by construction, not just by convention.
const CLOSE_DELAY_MS = 120;

export default function MemberOverflowCapsule({ names }: { names: string[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  // A short close delay (rather than closing instantly on mouseleave) is
  // what makes moving the pointer from "+N" into the popover itself
  // reliable — without it, the gap between the two elements reads as
  // "left" for a frame and the popover flickers shut before the pointer
  // arrives. Re-entering either element (handleOpen) cancels the pending
  // close, so hovering continuously across both never closes it.
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  function handleOpen() {
    cancelClose();
    setOpen(true);
  }

  // Recomputes on open (and on scroll/resize while open) from the trigger's
  // live bounding box — getBoundingClientRect() is already viewport-relative,
  // matching `position: fixed`'s coordinate space directly (no scrollX/
  // scrollY math needed, unlike `position: absolute`).
  useEffect(() => {
    if (!open || !triggerRef.current) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  if (names.length === 0) {
    return null;
  }

  const label = names.join(", ");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={handleOpen}
        onMouseLeave={scheduleClose}
        onFocus={handleOpen}
        onBlur={scheduleClose}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${names.length} more member${names.length === 1 ? "" : "s"}: ${label}`}
        title={label}
        className="text-neutral-400 dark:text-neutral-500 underline decoration-dotted underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300 focus:outline-none focus:text-neutral-700 dark:focus:text-neutral-300"
      >
        +{names.length}
      </button>

      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={handleOpen}
            onMouseLeave={scheduleClose}
            style={{ position: "fixed", top: position.top, left: position.left }}
            className="z-50 w-max max-w-56 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg px-3 py-2 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300"
          >
            {label}
          </div>,
          document.body
        )}
    </>
  );
}
