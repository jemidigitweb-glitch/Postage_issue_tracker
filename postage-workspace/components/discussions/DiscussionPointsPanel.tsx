import type { DiscussionPoint } from "@/lib/queries/discussionPoints";
import type { StaffRecord } from "@/lib/queries/staff";
import AddDiscussionPointForm from "./AddDiscussionPointForm";
import DiscussionPointCard from "./DiscussionPointCard";

export default function DiscussionPointsPanel({
  discussionId,
  points,
  staff,
  canManagePoints,
  canLinkIssue,
}: {
  discussionId: string;
  points: DiscussionPoint[];
  staff: StaffRecord[];
  canManagePoints: boolean;
  canLinkIssue: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Discussion Points ({points.length})
      </h2>

      {points.length === 0 && (
        <p className="text-sm text-neutral-400 dark:text-neutral-600">No discussion points yet.</p>
      )}

      <div className="flex flex-col gap-3">
        {points.map((point) => (
          <DiscussionPointCard
            key={point.pointId}
            discussionId={discussionId}
            point={point}
            canManagePoints={canManagePoints}
            canLinkIssue={canLinkIssue}
            staff={staff}
          />
        ))}
      </div>

      {canManagePoints && <AddDiscussionPointForm discussionId={discussionId} />}
    </div>
  );
}
