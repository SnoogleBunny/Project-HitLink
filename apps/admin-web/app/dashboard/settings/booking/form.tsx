"use client";
import { useActionState, useState } from "react";
import type { ClassSchedulingPolicy } from "@flowstate/db";
const schedulingWeekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
import { bookingRulesAction } from "./actions";
const label = (day: string) => day[0] + day.slice(1).toLowerCase();
const time = (minutes: number) =>
  minutes === 1440
    ? "24:00"
    : `${Math.floor(minutes / 60)
        .toString()
        .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
const minutes = (value: string) => {
  const parts = value.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
};
export function BookingRulesForm({
  initial,
  version,
}: {
  initial: ClassSchedulingPolicy | null;
  version: number;
}) {
  const [hours, setHours] = useState(
    initial?.classes.weeklyHours ??
      schedulingWeekdays.map((weekday) => ({
        weekday,
        intervals: [] as Array<{ startMinute: number; endMinute: number }>,
      })),
  );
  const [horizon, setHorizon] = useState(
    initial ? String(initial.classes.maxAdvanceMinutes / 1440) : "",
  );
  const [lead, setLead] = useState(
    initial ? String(initial.classes.minimumLeadMinutes) : "",
  );
  const [state, action, pending] = useActionState(bookingRulesAction, {
    baseVersion: version,
    confirmedVersion: null,
    error: null,
    success: null,
    review: null,
  });
  const change = (
    index: number,
    intervals: Array<{ startMinute: number; endMinute: number }>,
  ) =>
    setHours(
      hours.map((day, i) => (i === index ? { ...day, intervals } : day)),
    );
  const policy = {
    schemaVersion: 1,
    classes: {
      weeklyHours: hours,
      maxAdvanceMinutes: Math.round(Number(horizon) * 1440),
      minimumLeadMinutes: Number(lead),
    },
  };
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="management-card form-stack"
    >
      <h2>Class opening hours and booking window</h2>
      <p>
        These rules apply to new staff, member and public trial bookings, moves
        and automatic waitlist promotions. Each class keeps its own earlier
        booking deadline. Hours use the business timezone effective on the class
        date.
      </p>
      <input type="hidden" name="policy" value={JSON.stringify(policy)} />
      <input type="hidden" name="version" value={state.baseVersion} />
      {version > state.baseVersion && (
        <p role="alert">
          New booking rules were confirmed while this draft was open. Reload
          before changing this draft.
        </p>
      )}
      {hours.map((day, index) => (
        <fieldset className="form-stack" key={day.weekday}>
          <legend>{label(day.weekday)}</legend>
          {!day.intervals.length && <p>Closed for new class bookings</p>}
          {day.intervals.map((interval, n) => (
            <div className="form-grid" key={n}>
              <label>
                {label(day.weekday)} opening time {n + 1}
                <input
                  type="time"
                  required
                  value={time(interval.startMinute)}
                  onChange={(event) =>
                    change(
                      index,
                      day.intervals.map((v, i) =>
                        i === n
                          ? { ...v, startMinute: minutes(event.target.value) }
                          : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {label(day.weekday)} closing time {n + 1}
                <select
                  value={interval.endMinute === 1440 ? "midnight" : "time"}
                  onChange={(event) =>
                    change(
                      index,
                      day.intervals.map((v, i) =>
                        i === n
                          ? {
                              ...v,
                              endMinute:
                                event.target.value === "midnight" ? 1440 : 1260,
                            }
                          : v,
                      ),
                    )
                  }
                >
                  <option value="time">At a specific time</option>
                  <option value="midnight">End of day (midnight)</option>
                </select>
                {interval.endMinute !== 1440 && (
                  <input
                    aria-label={`${label(day.weekday)} closing clock time ${n + 1}`}
                    type="time"
                    required
                    value={time(interval.endMinute)}
                    onChange={(event) =>
                      change(
                        index,
                        day.intervals.map((v, i) =>
                          i === n
                            ? { ...v, endMinute: minutes(event.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                )}
              </label>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  change(
                    index,
                    day.intervals.filter((_, i) => i !== n),
                  )
                }
              >
                Remove {label(day.weekday)} interval {n + 1}
              </button>
            </div>
          ))}
          {day.intervals.length < 4 && (
            <button
              className="button button-secondary"
              type="button"
              onClick={() =>
                change(index, [
                  ...day.intervals,
                  { startMinute: 540, endMinute: 1260 },
                ])
              }
            >
              Add {label(day.weekday)} hours
            </button>
          )}
        </fieldset>
      ))}
      <label>
        Rolling booking horizon (days)
        <input
          type="number"
          min={1 / 1440}
          max="366"
          step="any"
          required
          value={horizon}
          onChange={(event) => setHorizon(event.target.value)}
        />
      </label>
      <p>
        A rolling day is 24 elapsed hours before the class starts. Bookings open
        at the start of this window.
      </p>
      <label>
        Minimum booking notice (minutes)
        <input
          type="number"
          min="0"
          max="527039"
          step="1"
          required
          value={lead}
          onChange={(event) => setLead(event.target.value)}
        />
      </label>
      <label>
        Reason for these rules
        <textarea name="reason" required maxLength={500} />
      </label>
      <p>
        Existing bookings keep their dates, seats and funding. Policy changes
        never extend a waitlist member’s original automatic-promotion deadline.
        Older queues without a recorded scheduling deadline need a fresh opt-in.
      </p>
      {state.error && (
        <div role="alert" className="notice notice-error">
          {state.error}
        </div>
      )}
      {state.success && (
        <div role="status" className="notice notice-success">
          {state.success}
        </div>
      )}
      <button
        className="button button-secondary"
        name="step"
        value="preview"
        disabled={pending}
      >
        Preview booking rules
      </button>
      {state.review && (
        <section className="form-stack" aria-label="Booking rules review">
          <h3>Review existing commitments</h3>
          <p>
            {state.review.retainedBookingCount} existing bookings keep their
            seats and funding. {state.review.queuedEntryCount} active waitlist
            entries keep their places; future promotions must satisfy the
            current rules and original consent deadline.
          </p>
          {state.review.retainedBookings.length > 0 && (
            <>
              <p>
                These bookings fall outside the proposed rules and will be
                retained:
              </p>
              <ul>
                {state.review.retainedBookings.map((booking) => (
                  <li key={booking.id}>
                    {booking.title} · {booking.date}: {booking.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <input
            type="hidden"
            name="previewHash"
            value={state.review.previewHash}
          />
          <label>
            <input type="checkbox" name="confirmCommitments" />I reviewed these
            commitments and confirm the rules for new requests.
          </label>
          <p>If you edit the proposal, preview it again before confirming.</p>
          <button
            className="button button-primary"
            name="step"
            value="confirm"
            disabled={pending}
          >
            Confirm class booking rules
          </button>
        </section>
      )}
    </form>
  );
}
