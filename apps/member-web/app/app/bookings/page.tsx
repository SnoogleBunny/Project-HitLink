import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { listMemberBookings } from "../../../lib/self-service-bookings";
import { BookingsList } from "./bookings-list";

export default async function BookingsPage() {
  const context = await requireMemberPortalContext();
  const bookings = await listMemberBookings({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
  });

  return (
    <MemberShell
      context={context}
      title="Your bookings"
      description="See upcoming classes, payment-pending drop-ins, waitlist entries, and recent booking changes."
    >
      <BookingsList
        history={bookings.history}
        upcoming={bookings.upcoming}
        waitlist={bookings.waitlist}
      />
    </MemberShell>
  );
}
