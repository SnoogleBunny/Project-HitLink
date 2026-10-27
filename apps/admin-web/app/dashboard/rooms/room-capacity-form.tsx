"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { RoomCapacitySettings } from "@flowstate/db";
import { roomCapacityAction } from "./capacity-actions";
const capacityLabel = (value: number | null) =>
  value === null ? "No room default limit" : `${value} places`;
export function RoomCapacityForm({
  initial,
  operationId,
  locale,
}: {
  initial: RoomCapacitySettings;
  operationId: string;
  locale: string;
}) {
  const capacityId = useId();
  const [capacity, setCapacity] = useState(
    initial.capacity === null ? "" : String(initial.capacity),
  );
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(roomCapacityAction, {
    baseVersion: initial.version,
    confirmedVersion: null,
    operationId,
    error: null,
    success: null,
    review: null,
  });
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  const newer = initial.version !== state.baseVersion;
  const changedFromReview =
    !!state.review &&
    (state.review.capacity !== (capacity.trim() ? Number(capacity) : null) ||
      state.review.reason !== reason.trim());
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="form-stack"
      aria-label="Room default capacity review"
    >
      <h3>Review room default capacity</h3>
      <p>
        Classes use this default only when they have no class-specific capacity.
        A separately configured class capacity takes precedence, including one
        higher than the room default. This change does not move or cancel
        reservations, promote a waiting person, change class times, or alter
        funding. Normal later booking and waitlist checks use the resulting
        capacity.
      </p>
      <p>
        Current room default: <strong>{capacityLabel(initial.capacity)}</strong>
        .
      </p>
      <input type="hidden" name="roomId" value={initial.roomId} />
      <input type="hidden" name="version" value={state.baseVersion} />
      <input type="hidden" name="operationId" value={state.operationId} />
      {newer ? (
        <p className="info-callout" aria-live="polite">
          Room settings changed while this draft was open. Reload and preview
          the current default before confirming; this draft has not adopted the
          newer version.
        </p>
      ) : null}
      {!initial.canChange ? (
        <p>
          This room is archived. Its default and review history remain
          available; new changes are disabled.
        </p>
      ) : null}
      <label className="field">
        <span id={`${capacityId}-label`}>Default capacity</span>
        <input
          name="capacity"
          type="number"
          min={1}
          max={2147483647}
          step={1}
          aria-labelledby={`${capacityId}-label`}
          aria-describedby={`${capacityId}-help`}
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          disabled={pending || !initial.canChange}
        />
        <small id={`${capacityId}-help`}>
          Leave blank for no room default limit. Class-specific capacities
          remain unchanged.
        </small>
      </label>
      <label className="field">
        <span>Reason for room default change</span>
        <textarea
          name="reason"
          minLength={5}
          maxLength={500}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={pending || !initial.canChange}
        />
      </label>
      {state.error ? (
        <p role="alert" tabIndex={-1} ref={errorRef} className="form-error">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p role="status">{state.success}</p> : null}
      <button
        className="button button-secondary"
        name="step"
        value="preview"
        formNoValidate
        disabled={pending || !initial.canChange || newer}
      >
        {pending ? "Reviewing…" : "Preview capacity effects"}
      </button>
      {state.review ? (
        <section className="info-callout" aria-label="Room capacity effects">
          <h4>
            {capacityLabel(state.review.previousCapacity)} →{" "}
            {capacityLabel(state.review.capacity)}
          </h4>
          <p>
            {state.review.defaultDefinitionCount} schedule definitions use this
            room default; {state.review.explicitDefinitionCount} define their
            own class capacity. Future dates continue to resolve their current
            schedule and any independent dated exceptions.
          </p>
          <p>
            {state.review.inheritedOccurrenceCount} future committed or
            waitlisted dates use this default.{" "}
            {state.review.explicitOverrideOccurrenceCount} committed dates have
            a class-specific capacity and remain unchanged.
          </p>
          {state.review.errors.length ? (
            <div role="alert">
              <h4>Resolve before confirming</h4>
              <ul>
                {state.review.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {state.review.inherited.length ? (
            <ul className="stack-list">
              {state.review.inherited.map((row) => (
                <li
                  key={`${row.classTemplateId}:${row.date}`}
                  className="stack-item"
                >
                  <div>
                    <strong>{row.title}</strong>
                    <p>
                      {row.date} ·{" "}
                      {new Intl.DateTimeFormat(locale, {
                        timeZone: row.timezone,
                        timeStyle: "short",
                      }).format(new Date(row.startsAt))}{" "}
                      ({row.timezone})
                    </p>
                    <p>
                      {row.reservations} reservations, including{" "}
                      {row.pendingPayments} pending payment; {row.waitlist}{" "}
                      waiting. Proposed default: {capacityLabel(row.capacity)}.
                    </p>
                    <Link
                      href={`/dashboard/schedule/${row.classTemplateId}/roster?date=${row.date}`}
                    >
                      Review this class
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No future committed or waitlisted date currently inherits this
              default. Future classes without a separate capacity will still use
              it.
            </p>
          )}
          {state.review.explicitOverrides.length ? (
            <details>
              <summary>Class-specific capacities stay unchanged</summary>
              <ul>
                {state.review.explicitOverrides.map((row) => (
                  <li key={`${row.classTemplateId}:${row.date}`}>
                    {row.title} · {row.date} · {capacityLabel(row.capacity)} ·{" "}
                    {row.reservations} reservations
                  </li>
                ))}
              </ul>
              {state.review.explicitOverrideOccurrenceCount >
              state.review.explicitOverrides.length ? (
                <p>
                  Showing {state.review.explicitOverrides.length} of{" "}
                  {state.review.explicitOverrideOccurrenceCount} unchanged
                  dates.
                </p>
              ) : null}
            </details>
          ) : null}
          <input
            type="hidden"
            name="previewHash"
            value={state.review.previewHash}
          />
          {changedFromReview ? (
            <p>
              Draft fields changed. Preview the new proposal before confirming.
            </p>
          ) : null}
          <label className="field-checkbox">
            <input
              type="checkbox"
              name="confirmEffects"
              required
              disabled={
                pending ||
                !initial.canChange ||
                newer ||
                changedFromReview ||
                !!state.review.errors.length
              }
            />
            <span>
              I reviewed the capacity effects. Existing reservations, waiting
              places and funding remain unchanged.
            </span>
          </label>
          <button
            className="button"
            name="step"
            value="confirm"
            disabled={
              pending ||
              !initial.canChange ||
              newer ||
              changedFromReview ||
              !!state.review.errors.length
            }
          >
            {pending ? "Confirming…" : "Confirm room default"}
          </button>
        </section>
      ) : null}
    </form>
  );
}
