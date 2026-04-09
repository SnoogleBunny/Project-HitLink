"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import {
  cancelSelfBookingAction,
  emptyBookingsActionState,
} from "./actions";
import type { MemberBookingSummary } from "../../../lib/self-service-bookings";

function BookingListSection({
  bookings,
  emptyMessage,
  allowCancel,
}: {
  bookings: MemberBookingSummary[];
  emptyMessage: string;
  allowCancel: boolean;
}) {
  const [state, formAction] = useActionState(
    cancelSelfBookingAction,
    emptyBookingsActionState,
  );

  if (bookings.length === 0) {
    return <p className="member-copy">{emptyMessage}</p>;
  }

  return (
    <div className="member-stack-list">
      {allowCancel && state.error ? (
        <p className="member-form-error">{state.error}</p>
      ) : null}

      {bookings.map((booking) => (
        <article key={booking.bookingId} className="member-stack-item">
          <div className="member-stack-copy">
            <div className="member-stack-heading">
              <h4>{booking.displayTitle}</h4>
              <span className="member-status-pill">{booking.status}</span>
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

          {allowCancel ? (
            <form action={formAction} className="member-inline-form">
              <input name="bookingId" type="hidden" value={booking.bookingId} />
              <SubmitButton
                disabled={!booking.canCancel}
                pendingLabel="Cancelling..."
              >
                {booking.canCancel ? "Cancel booking" : "Cancellation closed"}
              </SubmitButton>
            </form>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function BookingsList({
  upcoming,
  history,
}: {
  upcoming: MemberBookingSummary[];
  history: MemberBookingSummary[];
}) {
  return (
    <div className="member-grid">
      <section className="member-card">
        <p className="member-eyebrow">Upcoming</p>
        <h3>{upcoming.length} active booking{upcoming.length === 1 ? "" : "s"}</h3>
        <BookingListSection
          allowCancel
          bookings={upcoming}
          emptyMessage="No upcoming booked classes right now."
        />
      </section>

      <section className="member-card">
        <p className="member-eyebrow">History</p>
        <h3>{history.length} recent booking update{history.length === 1 ? "" : "s"}</h3>
        <BookingListSection
          allowCancel={false}
          bookings={history}
          emptyMessage="No recent booking history yet."
        />
      </section>
    </div>
  );
}
