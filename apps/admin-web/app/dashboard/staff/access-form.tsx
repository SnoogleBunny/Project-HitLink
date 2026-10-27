"use client";
import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { staffAccessAction } from "./actions";

export function StaffAccessForm({
  staff,
  operationId,
}: {
  staff: { id: string; role: string; isActive: boolean; updatedAt: string };
  operationId: string;
}) {
  const [state, action] = useActionState(staffAccessAction, {
    error: null,
    success: null,
  });
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="workspaceUserId" value={staff.id} />
      <input type="hidden" name="expectedUpdatedAt" value={staff.updatedAt} />
      <input type="hidden" name="operationId" value={operationId} />
      <label className="field">
        <span>Staff role</span>
        <select name="role" defaultValue={staff.role}>
          <option value="OWNER">Owner</option>
          <option value="COACH">Coach</option>
        </select>
      </label>
      <label className="field">
        <span>Access</span>
        <select
          name="isActive"
          defaultValue={staff.isActive ? "true" : "false"}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </label>
      <label className="field">
        <span>Reason for access change</span>
        <input name="reason" required minLength={5} maxLength={500} />
      </label>
      <p>
        Keep private client information out of the reason. Changes sign this
        person out of every device and reset optional progression permissions.
        Deactivation ends accepted coaching access immediately; reactivation
        requires a new client-approved coach assignment. Existing class
        assignments and appointment commitments stay available for owner review.
      </p>
      <label className="field-checkbox">
        <input type="checkbox" name="confirmAccessChange" required />
        <span>
          I reviewed this person’s role, access and service responsibilities.
        </span>
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p role="status">{state.success}</p> : null}
      <SubmitButton pendingLabel="Updating access…">
        Update staff access
      </SubmitButton>
    </form>
  );
}
