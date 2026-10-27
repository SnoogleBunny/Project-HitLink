"use client";

import { useActionState, useState } from "react";
import { changeFamilyPortalAccessAction } from "./actions";
import { SubmitButton } from "../../_components/submit-button";

interface Grant {
  userId: string;
  guardianId: string;
  version: number;
  canBook: boolean;
  canSign: boolean;
  canPay: boolean;
  canManageEmergencyContacts: boolean;
  revoked: boolean;
}

export function FamilyAccessForm({
  memberId,
  accounts,
  guardians,
  grants,
}: {
  memberId: string;
  accounts: Array<{ userId: string; label: string }>;
  guardians: Array<{ id: string; fullName: string }>;
  grants: Grant[];
}) {
  const [userId, setUserId] = useState(accounts[0]?.userId ?? "");
  const grant = grants.find((value) => value.userId === userId);
  const [state, action] = useActionState(changeFamilyPortalAccessAction, {
    error: null,
    success: null,
  });
  if (!accounts.length || !guardians.length)
    return (
      <p>
        Add a guardian relationship and create that adult&apos;s own portal
        account before granting family access.
      </p>
    );
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="expectedVersion" value={grant?.version ?? 0} />
      <label className="field">
        <span>Adult&apos;s portal account</span>
        <select
          name="userId"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.userId} value={account.userId}>
              {account.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset key={`${userId}:${grant?.version ?? 0}`} className="form-stack">
        <legend>Permissions for this family member</legend>
        <label className="field">
          <span>Verified guardian</span>
          <select
            name="guardianId"
            defaultValue={grant?.guardianId ?? guardians[0]?.id}
          >
            {guardians.map((guardian) => (
              <option key={guardian.id} value={guardian.id}>
                {guardian.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            name="canBook"
            defaultChecked={grant?.canBook ?? false}
          />{" "}
          Manage class bookings
        </label>
        <label>
          <input
            type="checkbox"
            name="canSign"
            defaultChecked={grant?.canSign ?? false}
          />{" "}
          Sign guardian forms
        </label>
        <label>
          <input
            type="checkbox"
            name="canPay"
            defaultChecked={grant?.canPay ?? false}
          />{" "}
          Make purchases for this member
        </label>
        <label>
          <input
            type="checkbox"
            name="canManageEmergencyContacts"
            defaultChecked={grant?.canManageEmergencyContacts ?? false}
          />{" "}
          Manage emergency contacts for this child
        </label>
        <label>
          <input type="checkbox" name="verified" /> I verified this account
          holder&apos;s identity and their authority for this member.
        </label>
        <label className="field">
          <span>Verification or revocation note</span>
          <textarea name="reason" required maxLength={2000} />
        </label>
      </fieldset>
      <p>
        Family access does not combine memberships or payment accounts. Matching
        names or email addresses do not grant access.
      </p>
      {grant?.revoked ? (
        <p>This account&apos;s previous family access was revoked.</p>
      ) : null}
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      {state.success ? <p role="status">{state.success}</p> : null}
      <div className="dashboard-actions">
        <SubmitButton
          pendingLabel="Saving permissions…"
          name="operation"
          value="grant"
        >
          Save verified permissions
        </SubmitButton>
        {grant && !grant.revoked ? (
          <SubmitButton
            pendingLabel="Revoking access…"
            name="operation"
            value="revoke"
          >
            Revoke family access
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
