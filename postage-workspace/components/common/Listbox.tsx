"use client";

import { useEffect, useId, useRef, useState } from "react";

// A small, accessible, application-styled dropdown.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────
// Every other dropdown in this project is a native <select>, which paints the
// operating system's own option list (the grey Chrome/Windows menu) rather
// than anything the application controls. That is acceptable for the filter
// bars, but not for the Assignee's status changer, which has to look like part
// of the app. There was no reusable custom dropdown to adopt, so this is it.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────
// Consumed ONLY by components/issues/AssigneeStatusControl.tsx. No Super Admin
// surface imports it, and no existing <select> was converted — the Super
// Admin's Issues table, filter bars, assignment control and Assigned Issues
// cards all still render exactly the markup they did before.
//
// ── STYLING ─────────────────────────────────────────────────────────────────
// The closed trigger reuses the app's select styling (see
// components/common/formStyles.ts, transcribed from the existing filter bars),
// so a closed Listbox and a closed <select> are visually the same control. The
// open menu reuses the popover treatment already used by
// components/discussions/MemberOverflowCapsule.tsx: rounded-lg, the same
// border, bg-white/dark:bg-neutral-900, shadow-lg.
//
// ── ACCESSIBILITY ───────────────────────────────────────────────────────────
// Implements the ARIA listbox pattern:
//   - trigger: role="combobox", aria-haspopup="listbox", aria-expanded,
//     aria-controls, and aria-activedescendant while open;
//   - popup: role="listbox" with role="option" children carrying aria-selected;
//   - keyboard: Enter/Space/ArrowDown/ArrowUp open; ArrowUp/ArrowDown move the
//     active option; Home/End jump; Enter/Space select; Escape closes and
//     returns focus to the trigger; Tab closes.
//   - pointer: click outside closes.
// Focus stays on the trigger the whole time (the "combobox keeps focus"
// variant), which is why the active option is communicated with
// aria-activedescendant rather than by moving DOM focus.
//
// This component holds NO form state of its own. The consumer keeps the value
// and renders whatever hidden input it needs, so nothing here can affect what
// a form submits.

import {
  fieldLabelClassName,
  selectClassName,
} from "./formStyles";

export interface ListboxOption<T extends string> {
  value: T;
  /** Exactly what the user sees. No suffixes are added by this component. */
  label: string;
}

function ChevronIcon({ open }: { open: boolean }) {
  // Same 16x16 / stroke="currentColor" inline-SVG convention as
  // components/discussions/icons.tsx and components/common/SortableHeader.tsx —
  // the project has no icon library dependency.
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Listbox<T extends string>({
  label,
  options,
  value,
  placeholder,
  disabled = false,
  onChange,
  className = "",
}: {
  /** Rendered above the control in the app's field-label style. */
  label: string;
  options: readonly ListboxOption<T>[];
  /** "" means nothing chosen yet — the placeholder shows. */
  value: T | "";
  placeholder: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Which option the keyboard is currently on. -1 = none.
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const labelId = `${baseId}-label`;

  const selected = options.find((option) => option.value === value) ?? null;

  // A disabled control must never be left hanging open (e.g. the form goes
  // pending while the menu is up). DERIVED rather than synced in an effect:
  // an effect that called setOpen(false) would render the open menu once
  // before closing it, and is exactly the pattern react-hooks warns about.
  // `open` stays the user's intent; `isOpen` is what actually paints.
  const isOpen = open && !disabled;

  // Close when the click lands outside the whole control. Registered only
  // while open, and removed on unmount, so there is no permanent global
  // listener.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function openMenu(startIndex: number) {
    if (disabled) return;
    setActiveIndex(startIndex);
    setOpen(true);
  }

  function closeMenu({ focusTrigger = true }: { focusTrigger?: boolean } = {}) {
    setOpen(false);
    setActiveIndex(-1);
    if (focusTrigger) {
      triggerRef.current?.focus();
    }
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeMenu();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        // Open on the currently-selected option when there is one, so
        // re-opening does not lose the user's place.
        const selectedIndex = options.findIndex((option) => option.value === value);
        openMenu(selectedIndex >= 0 ? selectedIndex : 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        openMenu(options.length - 1);
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        // Let focus move on, but never leave an orphaned open menu behind.
        closeMenu({ focusTrigger: false });
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex >= 0 ? activeIndex : 0);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span id={labelId} className={fieldLabelClassName}>
        {label}
      </span>

      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-labelledby={`${labelId} ${baseId}-value`}
          aria-activedescendant={isOpen && activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined}
          disabled={disabled}
          onClick={() => (isOpen ? closeMenu({ focusTrigger: false }) : openMenu(
            Math.max(0, options.findIndex((option) => option.value === value))
          ))}
          onKeyDown={handleKeyDown}
          className={`${selectClassName} flex w-full items-center justify-between gap-2 text-left ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <span
            id={`${baseId}-value`}
            className={selected ? "" : "text-neutral-400 dark:text-neutral-500"}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronIcon open={isOpen} />
        </button>

        {isOpen && (
          // The application's own menu — not the browser's. Same popover
          // treatment as MemberOverflowCapsule: rounded-lg, matching border,
          // solid surface, shadow-lg, above other content via z-20.
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-1 shadow-lg"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.value}
                  id={`${baseId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  // onMouseDown rather than onClick: the outside-click handler
                  // listens on mousedown, and a click that started inside is
                  // still inside, so ordering is not a problem — but selecting
                  // on mousedown also avoids the menu closing under the pointer
                  // between press and release.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(index);
                  }}
                  className={[
                    "cursor-pointer px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-700 dark:text-neutral-300",
                    isSelected ? "font-medium" : "",
                  ].join(" ")}
                >
                  {option.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
