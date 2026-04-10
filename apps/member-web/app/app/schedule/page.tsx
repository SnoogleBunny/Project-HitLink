import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { listEligibleSelfServiceOccurrences } from "../../../lib/self-service-bookings";
import { ScheduleList } from "./schedule-list";

export default async function SchedulePage() {
  const context = await requireMemberPortalContext();
  const schedule = await listEligibleSelfServiceOccurrences({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
  });

  return (
    <MemberShell
      context={context}
      title="Class schedule"
      description="Browse upcoming dated classes and use membership, punch-card, or member-portal drop-in access when available."
    >
      <section className="member-card">
        <p className="member-eyebrow">Upcoming occurrences</p>
        <h3>
          {schedule.occurrences.length} visible class option
          {schedule.occurrences.length === 1 ? "" : "s"}
        </h3>
        {schedule.occurrences.length === 0 ? (
          <p className="member-copy">
            No upcoming classes are available inside the current booking
            windows for your access products.
          </p>
        ) : (
          <ScheduleList occurrences={schedule.occurrences} />
        )}
      </section>
    </MemberShell>
  );
}
