import Link from "next/link";
import { MemberShell } from "../_components/member-shell";
import { requireMemberPortalContext } from "../../lib/member-auth";
import { getMemberPortalDashboard } from "../../lib/member-portal";

export default async function AppHomePage() {
  const context = await requireMemberPortalContext();
  const dashboard = await getMemberPortalDashboard({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
  });
  const currentMembership = dashboard.membership.currentMembership;
  const billingState = currentMembership?.billingState;

  return (
    <MemberShell
      context={context}
      title="Overview"
      description="See your current membership, billing state, upcoming bookings, and recent attendance at a glance."
    >
      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Membership</p>
          <h3>{currentMembership?.membershipPlan.name ?? "No current membership"}</h3>
          <p className="member-copy">
            {currentMembership
              ? `${currentMembership.status} · Next billing ${currentMembership.nextBillingDate?.toISOString().slice(0, 10) ?? "not set"}`
              : "A membership has not been assigned to this portal account yet."}
          </p>
          <Link className="member-text-link" href="/app/membership">
            Open membership details
          </Link>
        </section>

        <section className="member-card">
          <p className="member-eyebrow">Billing</p>
          <h3>{billingState?.status ?? "Not ready"}</h3>
          <p className="member-copy">
            {billingState?.failureMessage ??
              "Payment method updates and retry actions live in the billing page."}
          </p>
          <Link className="member-text-link" href="/app/billing">
            Open billing
          </Link>
        </section>
      </div>

      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Upcoming bookings</p>
          <h3>{dashboard.upcomingBookings.length} booked class{dashboard.upcomingBookings.length === 1 ? "" : "es"}</h3>
          {dashboard.upcomingBookings.length === 0 ? (
            <p className="member-copy">You do not have any upcoming bookings.</p>
          ) : (
            <div className="member-stack-list">
              {dashboard.upcomingBookings.map((booking) => (
                <article key={booking.bookingId} className="member-stack-item">
                  <div className="member-stack-copy">
                    <div className="member-stack-heading">
                      <h4>{booking.displayTitle}</h4>
                      <span className="member-status-pill member-status-pill-success">
                        {booking.status}
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

        <section className="member-card">
          <p className="member-eyebrow">Recent attendance</p>
          <h3>{dashboard.recentAttendance.length} recent visit{dashboard.recentAttendance.length === 1 ? "" : "s"}</h3>
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
                      <h4>{attendance.displayTitle}</h4>
                      <span className="member-status-pill">{attendance.state}</span>
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
      </div>
    </MemberShell>
  );
}
