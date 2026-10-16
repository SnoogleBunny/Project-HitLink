"use client";
import { useActionState, useState } from "react";
import { promotionAction } from "./actions";
export function PromotionForm({
  memberId,
  programId,
  ranks,
  coaches,
  today,
}: {
  memberId: string;
  programId: string;
  ranks: Array<{ key: string; name: string; maxStripes: number }>;
  coaches: Array<{ id: string; name: string }>;
  today: string;
}) {
  const [state, action, pending] = useActionState(
      promotionAction,
      {} as { error?: string; message?: string },
    ),
    [operationKey] = useState(() => crypto.randomUUID());
  return (
    <details open={Boolean(state.error || state.message)}>
      <summary>Record promotion or correction</summary>
      <form action={action} className="form-stack">
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="operationKey" value={operationKey} />
        <label className="field">
          <span>Rank</span>
          <select name="rankKey" required>
            {ranks.map((rank) => (
              <option key={rank.key} value={rank.key}>
                {rank.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Stripes</span>
          <input
            type="number"
            name="stripeCount"
            min="0"
            max="20"
            defaultValue="0"
            required
          />
        </label>
        <label className="field">
          <span>Effective date</span>
          <input
            name="effectiveOn"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </label>
        <label className="field">
          <span>Awarding coach</span>
          <select name="awardedByWorkspaceUserId" required>
            {coaches.map((coach) => (
              <option key={coach.id} value={coach.id}>
                {coach.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Note visible to member and verified guardian</span>
          <textarea name="publicNote" maxLength={2000} />
        </label>
        <label className="field">
          <span>Internal note</span>
          <textarea name="internalNote" maxLength={2000} />
        </label>
        <p>
          Corrections add a new record. Earlier promotion history is preserved.
        </p>
        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.message ? <p role="status">{state.message}</p> : null}
        <button className="button" disabled={pending}>
          {pending ? "Saving…" : "Record promotion"}
        </button>
      </form>
    </details>
  );
}
export function EligibilityExceptionForm({
  memberId,
  classTemplateId,
  date,
}: {
  memberId: string;
  classTemplateId: string;
  date: string;
}) {
  const [state, action, pending] = useActionState(
    promotionAction,
    {} as { error?: string; message?: string },
  );
  return (
    <form action={action} className="form-stack">
      <h2>Eligibility exception for {date}</h2>
      <input name="command" type="hidden" value="exception" />
      <input name="memberId" type="hidden" value={memberId} />
      <input name="classTemplateId" type="hidden" value={classTemplateId} />
      <input name="date" type="hidden" value={date} />
      <label className="field">
        <span>Reason for this class date</span>
        <textarea name="reason" minLength={5} maxLength={1000} required />
      </label>
      <p>
        This applies to rank, age and group requirements only. It cannot replace
        required signing authority or forms.
      </p>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      <button className="button" disabled={pending}>
        Record exception
      </button>
    </form>
  );
}
