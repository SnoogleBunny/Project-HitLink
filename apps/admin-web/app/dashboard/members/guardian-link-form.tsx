"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/admin-access";
import { addGuardianToMemberAction } from "./actions";

export function GuardianLinkForm({ memberId }: { memberId: string }) {
  const [state, formAction] = useActionState(
    addGuardianToMemberAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <input name="memberId" type="hidden" value={memberId} />

      <label className="field">
        <span>Guardian full name</span>
        <input
          name="guardianFullName"
          placeholder="Alex Lee"
          type="text"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Email</span>
          <input
            name="guardianEmail"
            placeholder="alex@example.com"
            type="email"
          />
        </label>

        <label className="field">
          <span>Phone</span>
          <input name="guardianPhone" placeholder="Optional" type="tel" />
        </label>
      </div>

      <label className="field">
        <span>Relationship</span>
        <input
          name="relationshipLabel"
          placeholder="Parent, guardian, emergency contact"
          type="text"
        />
      </label>

      <label className="field-checkbox">
        <input name="isPrimary" type="checkbox" />
        <div>
          <strong>Primary guardian</strong>
          <p>Used for basic visibility only in this slice.</p>
        </div>
      </label>

      <label className="field">
        <span>Guardian notes</span>
        <textarea
          name="guardianNotes"
          placeholder="Optional internal notes."
          rows={4}
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Linking guardian...">
        Link guardian
      </SubmitButton>
    </form>
  );
}
