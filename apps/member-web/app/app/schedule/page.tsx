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
      description="Browse the upcoming dated class occurrences that your current membership can book."
    >
      {schedule.eligibility === "no_membership" ? (
        <section className="member-card">
          <p className="member-eyebrow">Booking unavailable</p>
          <h3>No current membership</h3>
          <p className="member-copy">
            A current membership is required before self-service booking becomes
            available.
          </p>
        </section>
      ) : null}

      {schedule.eligibility === "membership_blocked" ? (
        <section className="member-card">
          <p className="member-eyebrow">Booking unavailable</p>
          <h3>Your membership cannot book right now</h3>
          <p className="member-copy">
            Frozen, cancelled, or ended memberships stay visible in the portal,
            but self-booking is disabled.
          </p>
        </section>
      ) : null}

      {schedule.eligibility === "eligible" ? (
        <section className="member-card">
          <p className="member-eyebrow">Upcoming occurrences</p>
          <h3>{schedule.occurrences.length} bookable class option{schedule.occurrences.length === 1 ? "" : "s"}</h3>
          {schedule.occurrences.length === 0 ? (
            <p className="member-copy">
              No eligible upcoming classes are available inside the current
              booking windows.
            </p>
          ) : (
            <ScheduleList occurrences={schedule.occurrences} />
          )}
        </section>
      ) : null}
    </MemberShell>
  );
}
