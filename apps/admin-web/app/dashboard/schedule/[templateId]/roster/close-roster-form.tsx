"use client";
import { useActionState } from "react";
import { closeRosterAction, type RosterCloseState } from "./actions";
import type { RosterMemberRow } from "../../../../../lib/rosters";

const initial: RosterCloseState = { error: null, message: "", skipped: [] };
export function CloseRosterForm({
  classTemplateId,
  scheduledForDate,
  requestKey,
  canClose,
  unresolvedCount,
  members,
}: {
  classTemplateId: string;
  scheduledForDate: string;
  requestKey: string;
  canClose: boolean;
  unresolvedCount: number;
  members: RosterMemberRow[];
}) {
  const [state, action, pending] = useActionState(closeRosterAction, initial);
  return (
    <form action={action} className="form-stack" aria-busy={pending}>
      <input type="hidden" name="classTemplateId" value={classTemplateId} />
      <input type="hidden" name="scheduledForDate" value={scheduledForDate} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <p>
        {unresolvedCount} confirmed booking
        {unresolvedCount === 1 ? " is" : "s are"} unresolved. Recorded
        attendance and waitlisted people stay unchanged. People with unmet
        requirements or restricted funding need review.
      </p>
      <label className="field-checkbox">
        <input
          name="confirm"
          type="checkbox"
          required
          disabled={!canClose || unresolvedCount === 0 || pending}
        />
        <span>Mark only unresolved eligible bookings as no-shows.</span>
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      {state.skipped.length ? (
        <ul>
          {state.skipped.map((item) => (
            <li key={item.memberId}>
              {members.find((member) => member.memberId === item.memberId)
                ?.memberName ?? "Participant"}
              : {item.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        className="button button-secondary"
        type="submit"
        disabled={!canClose || unresolvedCount === 0 || pending}
      >
        {pending ? "Closing roster…" : "Close roster"}
      </button>
    </form>
  );
}
