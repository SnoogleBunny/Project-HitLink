"use client";

import { useActionState, useState } from "react";
import type { CoachingBookingPolicy } from "@flowstate/db";
import { updateCoachingBookingPolicyAction, type CoachingBookingRulesState } from "./actions";

const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
type Weekday = typeof weekdays[number];
type IntervalDraft = { id: number; start: string; end: string; midnight: boolean };
type Editor = {
  hours: Array<{ weekday: Weekday; intervals: IntervalDraft[] }>;
  horizon: string; lead: string; buffer: string; response: string; reason: string;
  confirmed: boolean; nextInterval: number;
};
const dayLabel = (weekday: string) => weekday.charAt(0) + weekday.slice(1).toLowerCase();
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minutes = (value: string): number | null => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
};
const number = (value: string): number | null => value.trim() ? Number(value) : null;
function initialEditor(initial: CoachingBookingPolicy | null): Editor {
  let nextInterval = 0;
  return {
    hours: weekdays.map((weekday) => ({ weekday, intervals: (initial?.appointments.weeklyHours.find((day) => day.weekday === weekday)?.intervals ?? []).map((interval) => ({ id: nextInterval++, start: clock(interval.startMinute), end: interval.endMinute === 1440 ? "" : clock(interval.endMinute), midnight: interval.endMinute === 1440 })) })),
    horizon: initial ? String(initial.appointments.maxAdvanceMinutes) : "",
    lead: initial ? String(initial.appointments.minimumLeadMinutes) : "",
    buffer: initial ? String(initial.appointments.minimumBufferMinutes) : "",
    response: initial ? String(initial.appointments.resolutionResponseHours) : "",
    reason: "", confirmed: false, nextInterval,
  };
}
function editorPolicy(editor: Editor) {
  return { schemaVersion: 1, appointments: {
    weeklyHours: editor.hours.map((day) => ({ weekday: day.weekday, intervals: day.intervals.map((interval) => ({ startMinute: minutes(interval.start), endMinute: interval.midnight ? 1440 : minutes(interval.end) })).sort((a, b) => (a.startMinute ?? -1) - (b.startMinute ?? -1) || (a.endMinute ?? -1) - (b.endMinute ?? -1)) })),
    maxAdvanceMinutes: number(editor.horizon), minimumLeadMinutes: number(editor.lead),
    minimumBufferMinutes: number(editor.buffer), resolutionResponseHours: number(editor.response),
  } };
}

export function CoachingBookingRulesForm({ initial, version, initialOperationId }: {
  initial: CoachingBookingPolicy | null; version: number; initialOperationId: string;
}) {
  const [editor, setEditor] = useState(() => initialEditor(initial));
  const [state, action, pending] = useActionState<CoachingBookingRulesState, FormData>(updateCoachingBookingPolicyAction, {
    status: "idle", baseVersion: version, operationId: initialOperationId, confirmedVersion: null,
    message: null, review: null, request: null, confirmedPolicy: null,
  });
  const policy = editorPolicy(editor), policyJson = JSON.stringify(policy);
  const stale = version > state.baseVersion;
  const matchingReview = !!state.review && !!state.request && !stale
    && state.request.operationId === state.operationId && state.request.expectedVersion === state.baseVersion
    && JSON.stringify(state.request.policy) === policyJson && state.request.reason === editor.reason.trim();
  const edit = (changes: Partial<Editor>) => setEditor((current) => ({ ...current, ...changes, confirmed: false }));
  const changeInterval = (weekday: Weekday, intervalId: number, changes: Partial<IntervalDraft>) => setEditor((current) => ({
    ...current, confirmed: false,
    hours: current.hours.map((day) => day.weekday === weekday ? { ...day, intervals: day.intervals.map((interval) => interval.id === intervalId ? { ...interval, ...changes } : interval) } : day),
  }));
  return (
    <form action={action} onReset={(event) => event.preventDefault()} className="management-card form-stack">
      <h2>Program appointment service hours</h2>
      <p>These rules apply to new program appointment availability, bookings and moves. Programs with no appointments are unaffected.</p>
      {!initial && state.confirmedVersion === null && <p className="notice">Not configured. New program appointment times remain unavailable until an owner confirms these rules. Choose each setting explicitly.</p>}
      <p>Hours contain the appointment service itself. Preparation and recovery buffers may extend outside these hours; they protect the assigned coach, any recorded room and staff leave. Hours use the business timezone effective at the appointment time.</p>
      <input type="hidden" name="policy" value={policyJson} />
      <input type="hidden" name="expectedVersion" value={state.baseVersion} />
      <input type="hidden" name="operationId" value={state.operationId} />
      <div aria-live="polite" aria-atomic="true">
        {stale && <p role="alert" className="notice notice-error">New appointment rules were confirmed while this draft was open. Reload before submitting this draft; your current entries remain visible.</p>}
        {state.message && <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "notice notice-error" : "notice notice-success"}>{state.message}</p>}
      </div>
      <fieldset disabled={pending} className="form-stack">
        <legend>Weekly service hours</legend>
        <p>Leave a day closed or add one or more intervals. Split hours that cross midnight between the two days.</p>
        {editor.hours.map((day) => (
          <fieldset key={day.weekday} className="form-stack">
            <legend>{dayLabel(day.weekday)}</legend>
            {!day.intervals.length && <p>Closed for appointment service</p>}
            {day.intervals.map((interval, index) => (
              <div key={interval.id} className="form-grid">
                <label>{dayLabel(day.weekday)} start time {index + 1}
                  <input type="time" required value={interval.start} onChange={(event) => changeInterval(day.weekday, interval.id, { start: event.target.value })} />
                </label>
                <label>{dayLabel(day.weekday)} end type {index + 1}
                  <select value={interval.midnight ? "midnight" : "time"} onChange={(event) => changeInterval(day.weekday, interval.id, { midnight: event.target.value === "midnight" })}>
                    <option value="time">At a specific time</option><option value="midnight">End of day (midnight)</option>
                  </select>
                </label>
                {!interval.midnight && <label>{dayLabel(day.weekday)} end time {index + 1}
                  <input type="time" required value={interval.end} onChange={(event) => changeInterval(day.weekday, interval.id, { end: event.target.value })} />
                </label>}
                <button type="button" className="button button-secondary" onClick={() => setEditor((current) => ({ ...current, confirmed: false, hours: current.hours.map((item) => item.weekday === day.weekday ? { ...item, intervals: item.intervals.filter((item) => item.id !== interval.id) } : item) }))}>Remove {dayLabel(day.weekday)} interval {index + 1}</button>
              </div>
            ))}
            <button type="button" className="button button-secondary" onClick={() => setEditor((current) => ({ ...current, confirmed: false, nextInterval: current.nextInterval + 1, hours: current.hours.map((item) => item.weekday === day.weekday ? { ...item, intervals: [...item.intervals, { id: current.nextInterval, start: "", end: "", midnight: false }] } : item) }))}>Add {dayLabel(day.weekday)} interval</button>
          </fieldset>
        ))}
        <div className="form-grid">
          <label>Maximum advance booking (minutes)<input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required value={editor.horizon} onChange={(event) => edit({ horizon: event.target.value })} /></label>
          <label>Minimum booking notice (minutes)<input type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required value={editor.lead} onChange={(event) => edit({ lead: event.target.value })} /></label>
          <label>Minimum preparation and recovery buffer (minutes)<input type="number" min="0" max="2147483647" step="1" required value={editor.buffer} onChange={(event) => edit({ buffer: event.target.value })} /></label>
          <label>Booking-help review response (hours)<input type="number" min="1" max={Math.floor(Number.MAX_SAFE_INTEGER / 3600000)} step="1" required value={editor.response} onChange={(event) => edit({ response: event.target.value })} /></label>
        </div>
        <p>Booking opens this many elapsed advance minutes before service starts and closes at the minimum notice boundary. Maximum advance must exceed minimum notice. The buffer applies before and after each new appointment; a larger published slot buffer is retained.</p>
        <p>The booking-help window is the named case owner’s response time for a booking, extension or refund review. It differs from the coach’s general reply promise. Earlier, faster accepted booking-help promises are preserved.</p>
        <label>Reason for these appointment rules<textarea name="reason" required maxLength={500} value={editor.reason} onChange={(event) => edit({ reason: event.target.value })} /></label>
      </fieldset>
      <p>Existing accepted appointments keep their dates, recorded buffers and units. Confirming these rules does not move, cancel or refund them.</p>
      <button type="submit" className="button button-secondary" name="intent" value="PREVIEW" disabled={pending || stale} onClick={() => edit({})}>{pending ? "Reviewing appointment rules…" : "Preview appointment rules"}</button>
      {state.review && <section className="form-stack" aria-label="Appointment rules review">
        <h3>Review the effect on current commitments</h3>
        <p>{state.review.affectedAvailabilityCount} published availability times fall outside the proposed rules. They are retained and become bookable only when the current rules allow them.</p>
        <p>{state.review.retainedAppointmentCount} existing accepted appointments keep their recorded terms and units.</p>
        {!matchingReview && <p role="alert">This draft changed after review. Preview it again before confirming.</p>}
        <input type="hidden" name="previewHash" value={matchingReview ? state.review.previewHash : ""} />
        <label><input type="checkbox" name="confirmed" checked={editor.confirmed && matchingReview} disabled={pending || !matchingReview} onChange={(event) => setEditor((current) => ({ ...current, confirmed: event.target.checked }))} />I reviewed these effects and confirm the rules for new program appointment requests.</label>
        <button type="submit" className="button button-primary" name="intent" value="CONFIRM" disabled={pending || !matchingReview || !editor.confirmed}>Confirm appointment rules</button>
      </section>}
    </form>
  );
}
