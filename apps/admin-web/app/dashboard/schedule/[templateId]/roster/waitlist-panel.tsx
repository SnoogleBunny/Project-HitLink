"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../../../_components/submit-button";
import { emptyFormState } from "../../../../../lib/route-decisions";
import {
  promoteWaitlistAction,
  removeWaitlistAction,
} from "./actions";

interface WaitlistRow {
  id: string;
  memberId: string;
  memberName: string;
  memberStatus: string;
  email: string | null;
  phone: string | null;
  position: number;
  joinedAt: Date;
  autoPromotionOptedInAt?: Date | null;
  lastSkipReason?: string | null;
}

export function WaitlistPanel({
  classTemplateId,
  scheduledForDate,
  rows,
}: {
  classTemplateId: string;
  scheduledForDate: string;
  rows: WaitlistRow[];
}) {
  const [promoteState, promoteAction] = useActionState(
    promoteWaitlistAction,
    emptyFormState,
  );
  const [removeState, removeAction] = useActionState(
    removeWaitlistAction,
    emptyFormState,
  );

  return (
    <div className="stack-list">
      <p>Opted-in eligible members are booked automatically in queue order before both booking and cancellation deadlines. This control retries the same policy; older entries require fresh member or guardian consent.</p>
      {promoteState.error ? <p className="form-error">{promoteState.error}</p> : null}
      {removeState.error ? <p className="form-error">{removeState.error}</p> : null}

      <form action={promoteAction}>
        <input name="classTemplateId" type="hidden" value={classTemplateId} />
        <input name="scheduledForDate" type="hidden" value={scheduledForDate} />
        <SubmitButton
          disabled={rows.length === 0}
          pendingLabel="Promoting..."
        >
          Promote next
        </SubmitButton>
      </form>

      {rows.map((row) => (
        <article key={row.id} className="stack-item">
          <div className="stack-item-copy">
            <div className="stack-item-heading">
              <h4>{row.memberName}</h4>
              <span className="status-pill">#{row.position}</span>
              <span className="status-pill">{row.memberStatus}</span>
            </div>
            <p>{row.email ?? row.phone ?? "No contact details"}</p>
            <p>{row.autoPromotionOptedInAt ? "Automatic booking consent recorded" : "Fresh automatic booking consent needed"}</p>
            {row.lastSkipReason ? <p>Last skipped: {row.lastSkipReason}</p> : null}
          </div>

          <form action={removeAction} className="stack-item-actions">
            <input name="classTemplateId" type="hidden" value={classTemplateId} />
            <input name="waitlistEntryId" type="hidden" value={row.id} />
            <button className="button button-secondary" type="submit">
              Remove
            </button>
          </form>
        </article>
      ))}
    </div>
  );
}
