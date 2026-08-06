"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { emptyScheduleActionState } from "../../form-states";
import { createSelfBookingAction } from "./actions";
import type { ScheduleOccurrence } from "../../../lib/self-service-bookings";

function buildOccurrenceDateTimeLabel(occurrence: ScheduleOccurrence): string {
  return occurrence.dateLabel.includes(occurrence.timeLabel)
    ? occurrence.dateLabel
    : `${occurrence.dateLabel} at ${occurrence.timeLabel}`;
}

export function buildOccurrenceActionLabel(
  occurrence: ScheduleOccurrence,
  visibleLabel = occurrence.actionLabel,
): string {
  return `${visibleLabel} — ${occurrence.displayTitle}, ${buildOccurrenceDateTimeLabel(occurrence)}`;
}

export function buildOccurrenceErrorMessage(
  occurrence: ScheduleOccurrence,
  error: string,
): string {
  return `We could not complete this action for ${occurrence.displayTitle} on ${buildOccurrenceDateTimeLabel(occurrence)}. ${error} Review this class and try again.`;
}

export function getOccurrencePendingLabel(
  occurrence: ScheduleOccurrence,
): string {
  switch (occurrence.action) {
    case "book":
      return "Booking…";
    case "pay_and_book":
      return "Starting checkout…";
    case "join_waitlist":
      return "Joining waitlist…";
    case "none":
      return occurrence.actionLabel;
  }
}

function ScheduleOccurrenceAction({
  occurrence,
}: {
  occurrence: ScheduleOccurrence;
}) {
  const [state, formAction, isPending] = useActionState(
    createSelfBookingAction,
    emptyScheduleActionState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  const pendingLabel = getOccurrencePendingLabel(occurrence);
  const errorMessage = state.error
    ? buildOccurrenceErrorMessage(occurrence, state.error)
    : null;

  useEffect(() => {
    if (state.error) {
      errorRef.current?.focus();
    }
  }, [state]);

  return (
    <div className="member-occurrence-action">
      <form action={formAction} className="member-inline-form">
        <input name="actionKind" type="hidden" value={occurrence.action} />
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
        <button
          aria-describedby={errorMessage ? errorId : undefined}
          aria-label={buildOccurrenceActionLabel(
            occurrence,
            isPending ? pendingLabel : occurrence.actionLabel,
          )}
          className="member-button"
          disabled={isPending || occurrence.action === "none"}
          type="submit"
        >
          {isPending ? pendingLabel : occurrence.actionLabel}
        </button>
      </form>
      {errorMessage ? (
        <p
          className="member-form-error"
          id={errorId}
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export function ScheduleList({
  occurrences,
}: {
  occurrences: ScheduleOccurrence[];
}) {
  return (
    <div className="member-stack-list">
      {occurrences.map((occurrence) => (
        <article
          key={`${occurrence.classTemplateId}-${occurrence.scheduledForDate}`}
          className="member-stack-item"
        >
          <div className="member-stack-copy">
            <div className="member-stack-heading">
              <h4>{occurrence.displayTitle}</h4>
              <span
                className={`member-status-pill ${
                  occurrence.bookingState === "BOOKED"
                    ? "member-status-pill-success"
                    : ""
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

          <ScheduleOccurrenceAction occurrence={occurrence} />
        </article>
      ))}
    </div>
  );
}
