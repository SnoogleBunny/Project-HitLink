"use client";
import { useActionState, useState } from "react";
import { updateClassReminderSettingsAction } from "./actions";
export function ClassReminderSettingsForm({
  version,
  leadMinutes,
}: {
  version: number;
  leadMinutes: number | null;
}) {
  const [state, action, pending] = useActionState(
    updateClassReminderSettingsAction,
    { status: "idle" as const, version, leadMinutes, message: null },
  );
  const [enabled, setEnabled] = useState(leadMinutes !== null);
  const [draftMinutes, setDraftMinutes] = useState(
    leadMinutes === null ? "" : String(leadMinutes),
  );
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="stack-md">
      <input type="hidden" name="expectedVersion" value={state.version} />
      <label>
        Class and trial reminders
        <select
          name="mode"
          value={enabled ? "ON" : "OFF"}
          onChange={(event) => setEnabled(event.target.value === "ON")}
        >
          <option value="OFF">Off</option>
          <option value="ON">On</option>
        </select>
      </label>
      {enabled ? (
        <label>
          Minutes before class
          <input
            name="leadMinutes"
            type="number"
            min={1}
            max={527040}
            step={1}
            required
            value={draftMinutes}
            onChange={(event) => setDraftMinutes(event.target.value)}
            aria-describedby="class-reminder-help"
          />
        </label>
      ) : null}
      <p id="class-reminder-help">
        Send one reminder per current booking to the participant or a currently
        verified booking guardian. Messages are checked again before delivery.
        Changing this interval leaves bookings, charges and accepted
        cancellation terms in place.
      </p>
      <label>
        Reason for change
        <input
          name="reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save reminder settings"}
      </button>
    </form>
  );
}
