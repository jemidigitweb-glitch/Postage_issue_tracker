"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentUser, hasPermission } from "@/lib/auth";
import { createDiscussion, type CreateDiscussionParticipantInput } from "@/lib/queries/discussions";
import { findOrCreateDiscussionGroup } from "@/lib/queries/discussionGroups";

export interface NewDiscussionState {
  error?: string;
}

function nullableTrim(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str === "" ? null : str;
}

function parseTriBoolean(value: FormDataEntryValue | null): boolean | null {
  const str = String(value ?? "").trim();
  if (str === "yes") return true;
  if (str === "no") return false;
  return null;
}

export async function createDiscussionAction(
  _prevState: NewDiscussionState,
  formData: FormData
): Promise<NewDiscussionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "You must be signed in to create a discussion." };
  }
  // Permission matrix (lib/auth.ts): only management and admin hold
  // "discussion:create" — staff does not. Server-side enforcement, not just
  // a hidden button — this is the actual guard.
  if (!(await hasPermission(user, "discussion:create"))) {
    return { error: "You do not have permission to create discussions." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Title is required." };
  }

  const meetingGroupName = nullableTrim(formData.get("meetingGroupName"));
  const coordinatorName = nullableTrim(formData.get("coordinatorName"));
  const domain = nullableTrim(formData.get("domain"));
  const objective = nullableTrim(formData.get("objective"));
  const actionPlan = nullableTrim(formData.get("actionPlan"));
  const implementationProgress = nullableTrim(formData.get("implementationProgress"));
  const duration = nullableTrim(formData.get("duration"));
  const meetingDateStart = nullableTrim(formData.get("meetingDateStart"));
  const meetingDateEnd = nullableTrim(formData.get("meetingDateEnd"));
  const processStartDate = nullableTrim(formData.get("processStartDate"));
  const estimatedFinishDate = nullableTrim(formData.get("estimatedFinishDate"));
  const processStarted = parseTriBoolean(formData.get("processStarted"));

  const participantNames = formData.getAll("participantName").map((v) => String(v).trim());
  const participantRoles = formData.getAll("participantRole").map((v) => String(v).trim());
  const participantCoordinatorFlags = formData.getAll("participantIsCoordinator").map((v) => String(v).trim());

  const participants: CreateDiscussionParticipantInput[] = participantNames
    .map((name, i) => ({
      name,
      roleTitle: participantRoles[i] || null,
      managementUserId: null,
      isCoordinator: participantCoordinatorFlags[i] === "yes",
    }))
    .filter((p) => p.name !== "");

  // Keep the header coordinator field and the participants list consistent:
  // if a coordinator name was given and isn't already represented as a
  // coordinator participant row, add one automatically.
  if (coordinatorName && !participants.some((p) => p.isCoordinator && p.name === coordinatorName)) {
    participants.push({ name: coordinatorName, roleTitle: null, managementUserId: null, isCoordinator: true });
  }

  let discussionId: string;
  try {
    // "Meeting / Group Name" — reuses an existing discussion_groups row
    // with this exact title if one exists, otherwise creates a new one
    // (findOrCreateDiscussionGroup never creates a duplicate for the same
    // title). Left null entirely when the field is blank — a Discussion
    // does not have to belong to a group.
    const groupId = meetingGroupName
      ? await findOrCreateDiscussionGroup(
          { title: meetingGroupName, meetingDateStart, meetingDateEnd, coordinatorName },
          user.userId
        )
      : null;

    discussionId = await createDiscussion(
      {
        title,
        meetingDateStart,
        meetingDateEnd,
        coordinatorName,
        domain,
        objective,
        actionPlan,
        implementationProgress,
        duration,
        processStarted,
        processStartDate,
        estimatedFinishDate,
        participants,
        groupId,
      },
      user.userId
    );
  } catch (error) {
    console.error("[dashboard/discussions/new] failed to create discussion:", error);
    return { error: "Could not save this discussion. Please try again." };
  }

  revalidatePath("/dashboard/discussions");
  redirect(`/dashboard/discussions/${discussionId}`);
}
