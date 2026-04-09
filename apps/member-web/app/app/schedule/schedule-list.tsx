"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import {
  createSelfBookingAction,
  emptyScheduleActionState,
} from "./actions";
import type { ScheduleOccurrence } from "../../../lib/self-service-bookings";

export function ScheduleList({
  occurrences,
}: {
  occurrences: ScheduleOccurrence[];
}) {
  const [state, formAction] = useActionState(
    createSelfBookingAction,
    emptyScheduleActionState,
  );

  return (
    <div className="member-stack-list">
      {state.error ? <p className="member-form-error">{state.error}</p> : null}

      {occurrences.map((occurrence) => (
        <article key={`${occurrence.classTemplateId}-${occurrence.scheduledForDate}`} className="member-stack-item">
          <div className="member-stack-copy">
            <div className="member-stack-heading">
              <h4>{occurrence.displayTitle}</h4>
              {occurrence.isBooked ? (
                <span className="member-status-pill member-status-pill-success">
                  Booked
                </span>
              ) : null}
            </div>
            <p>{occurrence.dateLabel}</p>
            <dl className="member-inline-meta">
              <div>
                <dt>Program</dt>
                <dd>{occurrence.programName}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{occurrence.roomName}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{occurrence.timeLabel}</dd>
              </div>
            </dl>
          </div>

          <form action={formAction} className="member-inline-form">
            <input
              name="classTemplateId"
              type="hidden"
              value={occurrence.classTemplateId}
            />
            <input
              name="scheduledForDate"
              type="hidden"
              value={occurrence.scheduledForDate}
            />
            <SubmitButton
              disabled={occurrence.isBooked}
              pendingLabel="Booking..."
            >
              {occurrence.isBooked ? "Already booked" : "Book class"}
            </SubmitButton>
          </form>
        </article>
      ))}
    </div>
  );
}
