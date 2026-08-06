import Link from "next/link";
import { MemberShell } from "../_components/member-shell";
import { requireMemberPortalContext } from "../../lib/member-auth";
import { getMemberPortalDashboard } from "../../lib/member-portal";

function formatStatus(status: string) {
  const normalized = status.toLowerCase().replaceAll("_", " ");

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default async function AppHomePage() {
  const context = await requireMemberPortalContext();
  const dashboard = await getMemberPortalDashboard({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
  });
  const currentMembership = dashboard.membership.currentMembership;
  const billingState = currentMembership?.billingState;
  const membershipStatus = currentMembership
    ? currentMembership.status === "PENDING_PAYMENT_METHOD"
      ? "Payment setup needed"
      : formatStatus(currentMembership.status)
    : "No current membership";
  const billingStatus = billingState
    ? billingState.status === "PENDING_PAYMENT_METHOD"
      ? "Payment method needed"
      : formatStatus(billingState.status)
    : "Not ready";

  return (
    <MemberShell
      context={context}
      title="Overview"
      description="See your current membership, billing state, upcoming bookings, and recent attendance at a glance."
    >
      <section className="member-card member-card-featured">
        <p className="member-eyebrow">Upcoming bookings</p>
        <h2>
          {dashboard.upcomingBookings.length} booked class
          {dashboard.upcomingBookings.length === 1 ? "" : "es"}
        </h2>
        {dashboard.upcomingBookings.length === 0 ? (
          <div className="member-empty-state">
            <p className="member-copy">You do not have any upcoming bookings.</p>
            <Link className="member-text-link" href="/app/schedule">
              Browse the class schedule
            </Link>
          </div>
        ) : (
          <div className="member-stack-list">
            {dashboard.upcomingBookings.map((booking) => (
              <article key={booking.bookingId} className="member-stack-item">
                <div className="member-stack-copy">
                  <div className="member-stack-heading">
                    <h3>{booking.displayTitle}</h3>
                    <span className="member-status-pill member-status-pill-success">
                      {formatStatus(booking.status)}
                    </span>
                  </div>
                  <p>
                    {booking.scheduledForDate} at {booking.timeLabel}
                  </p>
                  <dl className="member-inline-meta">
                    <div>
                      <dt>Program</dt>
                      <dd>{booking.programName}</dd>
                    </div>
                    <div>
                      <dt>Room</dt>
                      <dd>{booking.roomName}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Membership</p>
          <h2>{currentMembership?.membershipPlan.name ?? "No current membership"}</h2>
          <p className="member-copy">
            {currentMembership
              ? `${membershipStatus} · Next billing ${currentMembership.nextBillingDate?.toISOString().slice(0, 10) ?? "not set"}`
              : "A membership has not been assigned to this portal account yet."}
          </p>
          <Link className="member-text-link" href="/app/membership">
            Open membership details
          </Link>
        </section>

        <section className="member-card">
          <p className="member-eyebrow">Billing</p>
          <h2>{billingStatus}</h2>
          <p className="member-copy">
            {billingState?.failureMessage ??
              "Payment method updates and retry actions live in the billing page."}
          </p>
          <Link className="member-text-link" href="/app/billing">
            Open billing
          </Link>
        </section>
      </div>

      <section className="member-card">
        <p className="member-eyebrow">Recent attendance</p>
        <h2>
          {dashboard.recentAttendance.length} recent visit
          {dashboard.recentAttendance.length === 1 ? "" : "s"}
        </h2>
        {dashboard.recentAttendance.length === 0 ? (
          <p className="member-copy">No attendance records are available yet.</p>
        ) : (
          <div className="member-stack-list">
            {dashboard.recentAttendance.map((attendance) => (
              <article
                key={attendance.attendanceRecordId}
                className="member-stack-item"
              >
                <div className="member-stack-copy">
                  <div className="member-stack-heading">
                    <h3>{attendance.displayTitle}</h3>
                    <span className="member-status-pill">
                      {formatStatus(attendance.state)}
                    </span>
                  </div>
                  <p>
                    {attendance.scheduledForDate} at {attendance.timeLabel}
                  </p>
                  <dl className="member-inline-meta">
                    <div>
                      <dt>Program</dt>
                      <dd>{attendance.programName}</dd>
                    </div>
                    <div>
                      <dt>Room</dt>
                      <dd>{attendance.roomName}</dd>
                    </div>
                    <div>
                      <dt>Note</dt>
                      <dd>{attendance.note ?? "No note"}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </MemberShell>
  );
}
