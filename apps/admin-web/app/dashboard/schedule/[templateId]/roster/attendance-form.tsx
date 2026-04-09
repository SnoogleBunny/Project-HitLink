"use client";

import { useActionState } from "react";
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
}: {
  row: RosterMemberRow;
  classTemplateId: string;
  scheduledForDate: string;
}) {
  const [state, formAction] = useActionState(
    recordAttendanceAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <input name="memberId" type="hidden" value={row.memberId} />
      <input name="classTemplateId" type="hidden" value={classTemplateId} />
      <input name="scheduledForDate" type="hidden" value={scheduledForDate} />

      <label className="field">
        <span>Attendance</span>
        <select defaultValue={row.attendanceState ?? ""} name="state">
          <option value="">Choose state</option>
          {["PRESENT", "LATE", "ABSENT", "NO_SHOW"].map((attendanceState) => (
            <option key={attendanceState} value={attendanceState}>
              {getStateLabel(attendanceState)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Note</span>
        <input
          defaultValue={row.attendanceNote ?? ""}
          name="note"
          placeholder="Optional"
          type="text"
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving attendance...">
        Save attendance
      </SubmitButton>
    </form>
  );
}
