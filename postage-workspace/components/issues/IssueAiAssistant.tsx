"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";

import {
  AI_ASSISTANT_DEFAULT_ENABLED,
  AI_ASSISTANT_PREFERENCE_KEY,
  browserPreferenceStorage,
  readAiAssistantPreference,
  writeAiAssistantPreference,
} from "@/lib/access/aiAssistantPreference";
import { cardClassName, sectionHeadingClassName } from "@/components/common/formStyles";
import { analyseIssueAction, type AnalyseIssueState } from "@/app/dashboard/issues/ai-actions";
import type { IssueAnalysis } from "@/lib/ai/analysisSchema";

// The AI Investigation Assistant panel — used by BOTH portals.
//
// Rendered from app/dashboard/issues/[issueId]/page.tsx behind
// view.showAiAssistant, which resolveIssueDetailView() sets for the Assignee
// (issue:analyse_own_assigned, own current assignment only) and for the Super
// Admin (issue:analyse_any, no assignment needed). Everyone else gets nothing,
// and analyseIssueAction re-checks the matching permission independently.
//
// ── NO OTHER ISSUE IS INVOLVED ──────────────────────────────────────────────
// The analysis uses the current Issue's title, description, domain and
// reported root cause, and nothing else. No historical, resolved or similar
// Issue is read, sent or displayed, so there is no "Similar Past Issues"
// section and audit decision D2 (cross-assignee visibility) is not reachable
// from this feature at all.
//
// Read-only by construction: the only controls are the toggle and one submit
// button. Nothing here writes to an Issue, and the action performs no database
// write. Feedback uses the app's existing inline pattern (role="alert" /
// role="status") — no toast library, no modal.

const initialState: AnalyseIssueState = {};

// ── The toggle's tiny external store ────────────────────────────────────────
// Exists so useSyncExternalStore can read the saved preference without an
// effect. It holds a boolean and nothing else — no Issue data, no identity, no
// secret ever passes through it.

interface PreferenceStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => boolean;
  set: (enabled: boolean) => void;
}

/**
 * Builds a store bound to ONE localStorage key, so the Assignee's and the
 * Super Admin's preferences are genuinely independent.
 *
 * A factory rather than module-level state: reassigning a module variable
 * during render is impure (and this project's lint rules reject it). Each
 * component instance memoises its own store on the key it was given.
 */
function createPreferenceStore(key: string): PreferenceStore {
  const listeners = new Set<() => void>();
  /** Set only when the browser refuses to persist (private mode, quota,
   *  blocked storage), so the toggle still responds for the rest of the
   *  session instead of appearing broken. */
  let sessionOnly: boolean | null = null;

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      // A "storage" event fires when ANOTHER tab changes the value, so the
      // two stay in step.
      if (typeof window !== "undefined") {
        window.addEventListener("storage", onStoreChange);
      }
      return () => {
        listeners.delete(onStoreChange);
        if (typeof window !== "undefined") {
          window.removeEventListener("storage", onStoreChange);
        }
      };
    },
    getSnapshot() {
      if (sessionOnly !== null) {
        return sessionOnly;
      }
      return readAiAssistantPreference(browserPreferenceStorage(), key);
    },
    set(enabled) {
      const storage = browserPreferenceStorage();
      writeAiAssistantPreference(storage, enabled, key);
      // If the write did not stick, keep the choice for this session.
      sessionOnly = readAiAssistantPreference(storage, key) === enabled ? null : enabled;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

const labelClassName =
  "text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5";
const bodyClassName = "text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed";
const mutedClassName = "text-xs text-neutral-500 dark:text-neutral-400";

const CONFIDENCE_STYLES: Record<string, string> = {
  LOW: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  MEDIUM: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  HIGH: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

function ConfidenceChip({ level }: { level: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        CONFIDENCE_STYLES[level] ?? CONFIDENCE_STYLES.LOW
      }`}
    >
      Confidence: {level}
    </span>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={labelClassName}>{title}</h3>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return <p className={mutedClassName}>None suggested.</p>;
  }
  return (
    <ul className={`${bodyClassName} list-disc pl-5 space-y-1`}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function AnalysisResult({ analysis }: { analysis: IssueAnalysis }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceChip level={analysis.confidence} />
        <span className={mutedClassName}>Advisory only — not saved, and it changes nothing.</span>
      </div>

      <Block title="Summary">
        <p className={bodyClassName}>{analysis.summary}</p>
      </Block>

      <Block title="Possible Root Causes">
        <ul className="flex flex-col gap-3">
          {analysis.likelyRootCauses.map((cause, index) => (
            <li key={index} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className={`${bodyClassName} font-medium`}>{cause.cause}</p>
                <ConfidenceChip level={cause.confidence} />
              </div>
              <p className={`${mutedClassName} mt-1`}>Why this is likely: {cause.whyLikely}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Where To Check">
        <ul className="flex flex-col gap-2">
          {analysis.areasToCheck.map((area, index) => (
            <li key={index}>
              <p className={`${bodyClassName} font-medium`}>{area.area}</p>
              <p className={mutedClassName}>{area.reason}</p>
              <p className={mutedClassName}>Check: {area.check}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Investigation Steps">
        <ol className={`${bodyClassName} list-decimal pl-5 space-y-1`}>
          {analysis.investigationSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </Block>

      <Block title="AI Suggested Fix (not saved)">
        <p className={bodyClassName}>{analysis.suggestedFix}</p>
        <p className={`${mutedClassName} mt-1`}>
          This is a suggestion. Your Final Resolution is recorded separately, by you.
        </p>
      </Block>

      <Block title="Alternative Solutions">
        <BulletList items={analysis.alternativeSolutions} />
      </Block>

      <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3">
        <h3 className={labelClassName}>Warning</h3>
        <ul className="text-sm text-amber-800 dark:text-amber-300 list-disc pl-5 space-y-1">
          {analysis.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Decorative animation, scoped to this component.
 *
 * Deliberately NOT added to app/globals.css: that file is shared with the
 * Super Admin pages, and this stage must not touch their styling. React 19
 * hoists a rendered <style> into the document, so the keyframes live with the
 * only component that uses them.
 *
 * Everything here is ornament. The whole block is disabled under
 * prefers-reduced-motion, and nothing about the control's behaviour, focus
 * order or labelling depends on it.
 */
function AiMotionStyles() {
  return (
    <style>{`
      @keyframes ai-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      @keyframes ai-breathe { 0%,100% { opacity: .35; transform: scale(1); } 50% { opacity: .6; transform: scale(1.06); } }
      @keyframes ai-think { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(8deg) scale(1.06); } 100% { transform: rotate(0deg) scale(1); } }
      .ai-float { animation: ai-float 4.5s ease-in-out infinite; }
      .ai-halo { animation: ai-breathe 4.5s ease-in-out infinite; }
      .ai-think { animation: ai-think 1.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .ai-float, .ai-halo, .ai-think { animation: none !important; }
      }
    `}</style>
  );
}

/** Inline SVG — this project has no icon library and none is being added.
 *  A four-point sparkle plus two small ones: the common "AI" mark, drawn
 *  here rather than copied from another product's iconography. */
function SparkleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="20"
      height="20"
      className={className}
    >
      <path d="M12 2.5l1.6 4.6a4 4 0 0 0 2.5 2.5l4.6 1.6-4.6 1.6a4 4 0 0 0-2.5 2.5L12 20l-1.6-4.7a4 4 0 0 0-2.5-2.5L3.3 11.2l4.6-1.6a4 4 0 0 0 2.5-2.5L12 2.5z" />
      <path d="M18.5 3l.6 1.7a1.6 1.6 0 0 0 1 1l1.7.6-1.7.6a1.6 1.6 0 0 0-1 1L18.5 9.6l-.6-1.7a1.6 1.6 0 0 0-1-1L15.2 6.3l1.7-.6a1.6 1.6 0 0 0 1-1L18.5 3z" opacity=".75" />
      <path d="M5.5 15l.45 1.3a1.2 1.2 0 0 0 .75.75l1.3.45-1.3.45a1.2 1.2 0 0 0-.75.75L5.5 20l-.45-1.3a1.2 1.2 0 0 0-.75-.75L3 17.5l1.3-.45a1.2 1.2 0 0 0 .75-.75L5.5 15z" opacity=".55" />
    </svg>
  );
}

/**
 * The Assignee's own ON/OFF switch for this panel.
 *
 * Still a real <button role="switch"> with aria-checked: focusable, operable
 * with Enter and Space for free, and `type="button"` so it can never submit a
 * form. Only its appearance changed — a track-and-knob switch whose ON state
 * uses the same near-black family as the primary action, so it reads as "AI
 * active" rather than "success".
 */
function AiToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="ai-assistant-heading"
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 ${
          enabled
            ? "bg-neutral-900 shadow-[0_0_0_3px_rgba(23,23,23,0.08)] dark:bg-neutral-100 dark:shadow-[0_0_0_3px_rgba(245,245,245,0.12)]"
            : "bg-neutral-200 dark:bg-neutral-700"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 dark:bg-neutral-900 ${
            enabled ? "translate-x-[1.125rem]" : "translate-x-[0.1875rem]"
          }`}
        />
      </button>
      <span
        className={`text-[11px] font-semibold uppercase tracking-wider ${
          enabled
            ? "text-neutral-700 dark:text-neutral-300"
            : "text-neutral-400 dark:text-neutral-500"
        }`}
      >
        {enabled ? "On" : "Off"}
      </span>
    </span>
  );
}

/**
 * The primary action: icon only, with the wording moved to an aria-label and a
 * hover/focus tooltip. Softly-rounded, slightly elevated, and gently floating.
 *
 * `disabled` while pending, which is what prevents a second submission.
 */
function AiActionButton({ pending }: { pending: boolean }) {
  return (
    <span className="group relative inline-flex flex-col items-center">
      {/* Faint halo — the only decorative accent, and only around the action. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-2 rounded-full bg-neutral-900/10 blur-md dark:bg-neutral-100/10 ${
          pending ? "" : "ai-halo"
        }`}
      />
      <button
        type="submit"
        disabled={pending}
        aria-label="Analyse this Issue with AI"
        className={`relative flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-900 text-white shadow-lg shadow-neutral-900/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-neutral-900/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-neutral-100 dark:text-neutral-900 dark:shadow-neutral-100/10 dark:focus-visible:ring-offset-neutral-900 ${
          pending ? "" : "ai-float"
        }`}
      >
        <SparkleIcon
          className={pending ? "ai-think" : "transition-transform duration-200 group-hover:scale-110"}
        />
      </button>
      {/* Tooltip: the wording still exists, it is simply not printed inside
          the button. Shown on hover AND on keyboard focus. Suppressed while
          analysing so it cannot overlap the "Analyzing..." label below. */}
      {!pending && (
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full mt-2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Analyse with AI
        </span>
      )}

      {/* Live status, directly beneath the animated icon. Rendered only while
          a request is genuinely in flight, so it disappears on success, on
          failure, and the moment the toggle is switched off (the whole panel
          body is gated on `enabled`). */}
      {pending && (
        <span
          role="status"
          className="pointer-events-none absolute top-full mt-2 whitespace-nowrap text-[11px] font-medium text-neutral-500 dark:text-neutral-400"
        >
          Analyzing...
        </span>
      )}
    </span>
  );
}

export default function IssueAiAssistant({
  issueId,
  /** Which localStorage key this portal's toggle uses. Separate keys mean the
   *  Assignee's and Super Admin's preferences are independent. */
  preferenceKey = AI_ASSISTANT_PREFERENCE_KEY,
}: {
  issueId: string;
  preferenceKey?: string;
}) {
  const [state, formAction, pending] = useActionState(analyseIssueAction, initialState);

  // One store per key, stable for the life of this component instance.
  const store = useMemo(() => createPreferenceStore(preferenceKey), [preferenceKey]);

  // ── STALE-RESULT GUARD ────────────────────────────────────────────────────
  // `runId` increments on every submission; `voidedRunId` records a run whose
  // result must never be shown — set when the Assignee switches the panel off
  // mid-flight.
  //
  // A Server Action invoked through useActionState cannot be aborted from the
  // browser, so the request may still complete on the server. What this guard
  // guarantees is that a voided run's answer is never RENDERED: it is dropped
  // on arrival, no error is shown for it, and switching the panel back on
  // returns to the ready state rather than resurrecting it or restarting it.
  const [runId, setRunId] = useState(0);
  const [voidedRunId, setVoidedRunId] = useState<number | null>(null);

  const currentRunIsVoided = voidedRunId === runId;

  // THE KEY LINE. `pending` stays true until the server replies, even after
  // the run has been voided — so every loading affordance is driven by this,
  // not by `pending`. Switching the toggle off stops the analysis instantly:
  // the spinner, the "Analyzing..." label and the disabled button all clear in
  // the same render, and switching back on returns to the READY state rather
  // than showing a run the user already abandoned.
  const analysing = pending && !currentRunIsVoided;

  // A voided or superseded run may not render. `state.runId` is echoed back by
  // the Server Action, so a late reply is matched to the run that asked for
  // it: if the user abandoned run 1, re-enabled and started run 2, run 1's
  // answer is discarded instead of being painted as run 2's.
  const stateBelongsToCurrentRun = state.runId === String(runId);
  const showResult = !currentRunIsVoided && stateBelongsToCurrentRun;
  const outcome = showResult ? state.outcome : undefined;
  const errorMessage = showResult ? state.error : undefined;

  // ── HYDRATION SAFETY ──────────────────────────────────────────────────────
  // useSyncExternalStore is the hydration-safe way to read a browser-only
  // value: the SERVER snapshot is the default, the CLIENT snapshot is the
  // saved preference, and React reconciles the two without a mismatch.
  //
  // Deliberately NOT an effect that calls setState — that is both a lint error
  // in this project and an extra render. Same reasoning, and the same pattern,
  // as components/issues/VoiceRecorder.tsx.
  //
  // This is presentation only. It gates one panel on one browser and
  // authorizes nothing: the Server Action re-checks the session, the
  // permission, current-assignment ownership and every Gemini flag on each
  // call, and none of them can be influenced from here.
  const enabled = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => AI_ASSISTANT_DEFAULT_ENABLED
  );

  function toggle() {
    const next = !enabled;
    // Switching OFF mid-analysis voids the run in flight IMMEDIATELY: the
    // loading state stops on this render, the result is discarded when it
    // eventually arrives, and switching back ON does not restart it.
    if (!next && pending) {
      setVoidedRunId(runId);
    }
    store.set(next);
  }

  return (
    <section className={`${cardClassName} flex flex-col gap-4 ring-1 ring-neutral-900/5 dark:ring-neutral-100/5`}>
      <AiMotionStyles />

      {/* Heading and toggle form ONE control group on the left; the action sits
          on the right. `flex-wrap` plus `gap` is what makes this collapse
          cleanly on a narrow screen — the button keeps its full tap target and
          nothing overlaps or overflows. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="ai-assistant-heading" className={sectionHeadingClassName}>
            AI Investigation Assistant
          </h2>
          <AiToggle enabled={enabled} onToggle={toggle} />
        </div>

        {/* The action is not rendered at all while the Assignee has the panel
            switched off — there is nothing to click, and nothing to mislead. */}
        {enabled && (
          <form action={formAction} onSubmit={() => setRunId((previous) => previous + 1)}>
            <input type="hidden" name="issueId" value={issueId} />
            {/* Echoed back by the action so a late reply can be matched to
                the run that asked for it. Not identity, and not trusted for
                anything: it is compared, never acted on. */}
            <input type="hidden" name="runId" value={String(runId + 1)} />
            <AiActionButton pending={analysing} />
          </form>
        )}
      </div>

      {!enabled && <p className={mutedClassName}>AI Assistant is turned off.</p>}

      {enabled && !outcome && !errorMessage && !analysing && (
        <p className={mutedClassName}>
          AI-assisted investigation guidance. Suggestions are advisory and are not saved
          automatically.
        </p>
      )}

      {/* Everything below is hidden while the toggle is off, so a result from
          an earlier run is not left on screen after switching off — and a
          voided run's outcome is dropped by the stale-result guard above. */}
      {enabled && analysing && (
        <p role="status" className={mutedClassName}>
          Analysing… this can take up to a minute.
        </p>
      )}

      {enabled && errorMessage && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {/* Disabled / unconfigured / real-data-blocked all render the same calm
          way: a plain sentence with no environment detail in it. */}
      {enabled && outcome?.status === "blocked" && (
        <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          {outcome.message}
        </p>
      )}

      {enabled && outcome?.status === "failed" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {outcome.message}
        </p>
      )}

      {enabled && outcome?.status === "ok" && <AnalysisResult analysis={outcome.analysis} />}
    </section>
  );
}
