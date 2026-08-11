"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { createDiscussionAction, type NewDiscussionState } from "./actions";

const initialState: NewDiscussionState = {};

const inputClassName =
  "w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100";
const labelClassName = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";

interface ParticipantRow {
  key: number;
  name: string;
  role: string;
  isCoordinator: boolean;
}

let nextRowKey = 1;

export default function NewDiscussionForm() {
  const [state, formAction, pending] = useActionState(createDiscussionAction, initialState);
  const [participants, setParticipants] = useState<ParticipantRow[]>([
    { key: nextRowKey++, name: "", role: "", isCoordinator: false },
  ]);

  function updateRow(key: number, patch: Partial<ParticipantRow>) {
    setParticipants((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setParticipants((rows) => [...rows, { key: nextRowKey++, name: "", role: "", isCoordinator: false }]);
  }

  function removeRow(key: number) {
    setParticipants((rows) => rows.filter((row) => row.key !== key));
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 max-w-3xl">
      <div>
        <label htmlFor="title" className={labelClassName}>
          Title
        </label>
        <input id="title" name="title" type="text" required maxLength={300} className={inputClassName} />
      </div>

      <div>
        <label htmlFor="meetingGroupName" className={labelClassName}>
          Meeting / Group Name
        </label>
        <input
          id="meetingGroupName"
          name="meetingGroupName"
          type="text"
          maxLength={300}
          placeholder="e.g. Weekly Sales Sync — leave blank for a standalone discussion"
          className={inputClassName}
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          If a group with this exact name already exists, this Discussion joins it. Otherwise a new group is
          created.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="meetingDateStart" className={labelClassName}>
            Meeting Date (start)
          </label>
          <input id="meetingDateStart" name="meetingDateStart" type="date" className={inputClassName} />
        </div>
        <div>
          <label htmlFor="meetingDateEnd" className={labelClassName}>
            Meeting Date (end, if a range)
          </label>
          <input id="meetingDateEnd" name="meetingDateEnd" type="date" className={inputClassName} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="coordinatorName" className={labelClassName}>
            Coordinator
          </label>
          <input id="coordinatorName" name="coordinatorName" type="text" maxLength={150} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="domain" className={labelClassName}>
            Main Domain
          </label>
          <input
            id="domain"
            name="domain"
            type="text"
            maxLength={50}
            placeholder="e.g. sales, pricing, stock, listing, complaints, website, operations"
            className={inputClassName}
          />
        </div>
      </div>

      <div>
        <label htmlFor="objective" className={labelClassName}>
          Overall Objective / Description
        </label>
        <textarea id="objective" name="objective" rows={4} className={inputClassName} />
      </div>

      <div>
        <label htmlFor="actionPlan" className={labelClassName}>
          Action
        </label>
        <textarea id="actionPlan" name="actionPlan" rows={3} className={inputClassName} />
      </div>

      <div>
        <label htmlFor="implementationProgress" className={labelClassName}>
          Implementation / Progress
        </label>
        <textarea id="implementationProgress" name="implementationProgress" rows={3} className={inputClassName} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="duration" className={labelClassName}>
            Duration
          </label>
          <input
            id="duration"
            name="duration"
            type="text"
            maxLength={100}
            placeholder="e.g. ongoing, 2 days"
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="processStarted" className={labelClassName}>
            Process Started
          </label>
          <select id="processStarted" name="processStarted" defaultValue="" className={inputClassName}>
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="processStartDate" className={labelClassName}>
            Process Start Date
          </label>
          <input id="processStartDate" name="processStartDate" type="date" className={inputClassName} />
        </div>
        <div>
          <label htmlFor="estimatedFinishDate" className={labelClassName}>
            Estimated Finish Date
          </label>
          <input id="estimatedFinishDate" name="estimatedFinishDate" type="date" className={inputClassName} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={labelClassName}>Participants / Members</span>
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:underline"
          >
            + Add participant
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {participants.map((row) => (
            <div key={row.key} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                name="participantName"
                placeholder="Name"
                value={row.name}
                onChange={(e) => updateRow(row.key, { name: e.target.value })}
                className={`${inputClassName} w-48`}
              />
              <input
                type="text"
                name="participantRole"
                placeholder="Role / title / team (optional)"
                value={row.role}
                onChange={(e) => updateRow(row.key, { role: e.target.value })}
                className={`${inputClassName} w-56`}
              />
              <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={row.isCoordinator}
                  onChange={(e) => updateRow(row.key, { isCoordinator: e.target.checked })}
                  className="h-3.5 w-3.5"
                />
                Coordinator
              </label>
              <input type="hidden" name="participantIsCoordinator" value={row.isCoordinator ? "yes" : "no"} />
              {participants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          If a Coordinator name is set above and not listed here as a participant, they will be added
          automatically.
        </p>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        New discussions are always created with status <span className="font-semibold">RED</span>.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/discussions"
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 disabled:opacity-60 hover:opacity-90 transition-opacity"
        >
          {pending ? "Creating…" : "Create Discussion"}
        </button>
      </div>
    </form>
  );
}
