import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import { listBookingFormOptions } from "../../../lib/bookings";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { BookingCreateForm } from "./booking-create-form";

export default async function BookingsPage() {
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const options = await listBookingFormOptions({
    workspaceId: workspace.id,
    timezone: location.timezone,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Bookings"
      title="Class bookings"
      description="Create a dated booking from the recurring template schedule using the member's current access rules."
      actions={
        <Link className="button button-secondary" href="/dashboard/coach/today">
          Today&apos;s roster
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create booking</p>
          <h3>Member into class date</h3>
          <p className="management-copy">
            Book a member into one real dated occurrence. Duplicate bookings are
            blocked, cancelled bookings are restored, and access is chosen
            automatically in this order: membership, then punch card, then
            drop-in.
          </p>
          <p className="management-copy">
            If a class is only available through a paid drop-in flow, ask the
            member to book it from the portal.
          </p>
          <BookingCreateForm options={options} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Current slice</p>
          <h3>Date-based class access</h3>
          <p className="management-copy">
            This page uses the template and selected date as the occurrence. It
            respects capacity, waitlist, punch-card, and membership rules
            without creating separate class instance rows.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Members available</dt>
              <dd>{options.members.length}</dd>
            </div>
            <div>
              <dt>Templates with upcoming dates</dt>
              <dd>{options.templates.length}</dd>
            </div>
          </dl>
        </section>
      </div>
    </AdminShell>
  );
}
