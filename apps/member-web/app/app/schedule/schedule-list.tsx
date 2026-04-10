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
              <span
                className={`member-status-pill ${
                  occurrence.bookingState === "BOOKED" ? "member-status-pill-success" : ""
                }`}
              >
                {occurrence.bookingState.replace("_", " ")}
              </span>
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
              <div>
                <dt>Capacity</dt>
                <dd>{occurrence.capacityLabel}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{occurrence.accessLabel ?? "Unavailable"}</dd>
              </div>
            </dl>
            {occurrence.note ? <p>{occurrence.note}</p> : null}
          </div>

          <form action={formAction} className="member-inline-form">
            <input
              name="actionKind"
              type="hidden"
              value={occurrence.action}
            />
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
              disabled={occurrence.action === "none"}
              pendingLabel="Saving..."
            >
              {occurrence.actionLabel}
            </SubmitButton>
          </form>
        </article>
      ))}
    </div>
  );
}
