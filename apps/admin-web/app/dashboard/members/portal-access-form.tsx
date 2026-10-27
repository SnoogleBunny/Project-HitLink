"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import {
  createMemberPortalAccessAction,
  resetMemberPortalPasswordAction,
} from "./actions";

interface PortalAccessFormProps {
  memberId: string;
  memberEmail: string | null;
  portalAccessEmail: string | null;
}

function PasswordFields({ memberId }: { memberId: string }) {
  return (
    <>
      <input name="memberId" type="hidden" value={memberId} />

      <label className="field">
        <span>Temporary password</span>
        <input
          autoComplete="new-password"
          name="password"
          minLength={12}
          maxLength={72}
          placeholder="At least 12 characters"
          type="password"
        />
      </label>

      <label className="field">
        <span>Confirm password</span>
        <input
          autoComplete="new-password"
          name="confirmPassword"
          minLength={12}
          maxLength={72}
          placeholder="Repeat the password"
          type="password"
        />
      </label>
      <p className="management-copy">
        New passwords need at least 12 characters and no more than 72 bytes.
        Accented characters and emoji can use more than one byte.
      </p>
    </>
  );
}

export function PortalAccessForm({
  memberId,
  memberEmail,
  portalAccessEmail,
}: PortalAccessFormProps) {
  const hasPortalAccess = Boolean(portalAccessEmail);
  const [state, formAction] = useActionState(
    hasPortalAccess
      ? resetMemberPortalPasswordAction
      : createMemberPortalAccessAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <p className="management-copy">
        {hasPortalAccess
          ? `Portal login email: ${portalAccessEmail}`
          : memberEmail
            ? `Portal access will use ${memberEmail} as the login email.`
            : "Add an email in the member profile before creating portal access."}
      </p>

      <PasswordFields memberId={memberId} />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving portal access...">
        {hasPortalAccess ? "Reset portal password" : "Create portal access"}
      </SubmitButton>
    </form>
  );
}
