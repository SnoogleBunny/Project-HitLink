"use client";

import { useActionState, useState } from "react";
import { Notice, useWorkspaceLocale } from "@flowstate/ui";
import { workspaceTimezoneAction } from "./actions";

interface Revision {
  id: string;
  version: number;
  previousTimezone: string;
  timezone: string;
  effectiveFromDate: string;
  effectiveAt: string;
  createdAt: string;
}

export function TimezoneForm({
  currentTimezone,
  version,
  earliestDate,
  history,
  timezoneOptions,
}: {
  currentTimezone: string;
  version: number;
  earliestDate: string;
  history: Revision[];
  timezoneOptions: string[];
}) {
  const locale = useWorkspaceLocale();
  // A server-action preview must not erase the proposal when it reports a
  // blocker. Controlled fields let the owner adjust just the suggested date.
  // Cancel the action's native reset too: React 19 can reset controlled selects.
  const [proposedTimezone, setProposedTimezone] = useState(currentTimezone);
  const [proposedDate, setProposedDate] = useState("");
  function instantLabel(instant: string, timezone: string) {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "shortOffset",
    }).format(new Date(instant));
  }

  const [state, action, pending] = useActionState(workspaceTimezoneAction, {
    error: null,
    success: null,
    review: null,
  });
  const review = state.review;
  return (
    <section className="management-card form-stack">
      <h2>Business timezone</h2>
      <p>
        Current timezone: <strong>{currentTimezone}</strong>
      </p>
      <p>
        Preview a future change before confirming. Existing class bookings,
        attendance and active waitlists keep their dates and funding; choose an
        effective date after those commitments. Accepted membership and coaching
        timezones stay with their contracts. Appointments with a confirmed
        instant keep that instant.
      </p>
      {state.error ? (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      ) : null}
      {state.success ? (
        <Notice tone="success" role="status">
          {state.success}
        </Notice>
      ) : null}
      <form
        action={action}
        className="form-stack"
        aria-busy={pending}
        onReset={(event) => event.preventDefault()}
      >
        <input type="hidden" name="step" value="preview" />
        <input type="hidden" name="timezoneVersion" value={version} />
        <label className="field">
          <span>New business timezone</span>
          <select
            name="timezone"
            value={proposedTimezone}
            onChange={(event) => setProposedTimezone(event.target.value)}
            required
          >
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Effective from class date</span>
          <input
            name="effectiveFromDate"
            type="date"
            min={earliestDate}
            value={proposedDate}
            onChange={(event) => setProposedDate(event.target.value)}
            required
          />
        </label>
        <button
          className="button button-secondary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Reviewing…" : "Preview timezone change"}
        </button>
      </form>
      {review ? (
        <section className="form-stack" aria-label="Timezone change preview">
          <h3>
            {review.previousTimezone} → {review.timezone}
          </h3>
          <p>
            From class date {review.effectiveFromDate}. The business clock
            changes at {instantLabel(review.effectiveAt, review.timezone)}.
          </p>
          {review.errors.length ? (
            <div role="alert" className="form-stack">
              {review.errors.map((error) => (
                <Notice key={error} tone="danger">
                  {error}
                </Notice>
              ))}
            </div>
          ) : null}
          {review.blockers.length ? (
            <>
              <p>
                Earliest date after these commitments:{" "}
                <strong>{review.earliestSafeDate}</strong>. Preview that date to
                check the schedule again.
              </p>
              <div className="hl-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date and class</th>
                      <th>Bookings</th>
                      <th>Attendance</th>
                      <th>Waitlist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.blockers.map((row) => (
                      <tr key={`${row.date}:${row.title}`}>
                        <td>
                          {row.date} · {row.title}
                        </td>
                        <td>{row.bookings}</td>
                        <td>{row.attendance}</td>
                        <td>{row.waitlist}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {review.affected.length ? (
            <>
              <h3>Upcoming class examples</h3>
              <div className="hl-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.affected.map((row, index) => (
                      <tr key={`${row.date}:${index}`}>
                        <td>
                          {row.date} · {row.title}
                        </td>
                        <td>
                          {instantLabel(
                            row.previousStartsAt,
                            row.previousTimezone,
                          )}
                        </td>
                        <td>{instantLabel(row.startsAt, row.timezone)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>No published class times are affected.</p>
          )}
          <p>
            Daylight-saving review runs through {review.previewThrough}. Each
            later class date is checked again before publication or booking.
            Missing or repeated local times must be resolved first.
          </p>
          {review.ok ? (
            <form action={action} className="form-stack">
              <input type="hidden" name="step" value="confirm" />
              <input
                type="hidden"
                name="timezoneVersion"
                value={review.version}
              />
              <input type="hidden" name="timezone" value={review.timezone} />
              <input
                type="hidden"
                name="effectiveFromDate"
                value={review.effectiveFromDate}
              />
              <input
                type="hidden"
                name="previewHash"
                value={review.previewHash}
              />
              <label className="field-checkbox">
                <input name="confirmTimezone" type="checkbox" required />
                <span>
                  I reviewed the dates and confirm this future timezone change.
                </span>
              </label>
              <button className="button" type="submit" disabled={pending}>
                {pending ? "Confirming…" : "Confirm timezone change"}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      {history.length ? (
        <section className="form-stack">
          <h3>Timezone change history</h3>
          <ul>
            {history.map((revision) => (
              <li key={revision.id}>
                Version {revision.version}: {revision.previousTimezone} →{" "}
                {revision.timezone}, effective from {revision.effectiveFromDate}
                .
              </li>
            ))}
          </ul>
          <p>
            Confirmed history is preserved. A later change needs a new preview
            and a later effective date.
          </p>
        </section>
      ) : null}
    </section>
  );
}
