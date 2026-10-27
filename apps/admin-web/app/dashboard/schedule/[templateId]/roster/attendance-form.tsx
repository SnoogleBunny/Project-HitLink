"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "../../../../_components/submit-button";
import { emptyFormState } from "../../../../../lib/route-decisions";
import type { RosterMemberRow } from "../../../../../lib/rosters";
import { recordAttendanceAction } from "./actions";

function getStateLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function AttendanceForm({
  row,
  classTemplateId,
  scheduledForDate,
  requestKey,
  noShowAllowed,
}: {
  row: RosterMemberRow;
  classTemplateId: string;
  scheduledForDate: string;
  requestKey: string;
  noShowAllowed: boolean;
}) {
  const [state, formAction] = useActionState(
    recordAttendanceAction,
    emptyFormState,
  );
  const [attendance, setAttendance] = useState(row.attendanceState ?? "");
  const [note, setNote] = useState(row.attendanceNote ?? "");
  const correcting =
    Boolean(row.attendanceState) &&
    (attendance !== row.attendanceState ||
      note.trim() !== (row.attendanceNote ?? ""));

  return (
    <form action={formAction} className="form-stack">
      <input name="memberId" type="hidden" value={row.memberId} />
      <input name="classTemplateId" type="hidden" value={classTemplateId} />
      <input name="scheduledForDate" type="hidden" value={scheduledForDate} />
      <input name="requestKey" type="hidden" value={requestKey} />
      <input
        name="expectedVersion"
        type="hidden"
        value={row.attendanceVersion ?? "UNRECORDED"}
      />

      <label className="field">
        <span>Attendance</span>
        <select
          value={attendance}
          onChange={(event) =>
            setAttendance(event.target.value as typeof attendance)
          }
          name="state"
        >
          <option value="">Choose state</option>
          {["PRESENT", "LATE", "ABSENT", "NO_SHOW"].map((attendanceState) => (
            <option
              key={attendanceState}
              value={attendanceState}
              disabled={attendanceState === "NO_SHOW" && !noShowAllowed}
            >
              {getStateLabel(attendanceState)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Note</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          name="note"
          placeholder="Optional"
          type="text"
        />
      </label>

      {row.attendanceState ? (
        <label className="field">
          <span>Correction reason</span>
          <textarea
            name="reason"
            maxLength={1000}
            required={correcting}
            placeholder="Explain what changed"
          />
        </label>
      ) : null}

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving attendance...">
        Save attendance
      </SubmitButton>
    </form>
  );
}
