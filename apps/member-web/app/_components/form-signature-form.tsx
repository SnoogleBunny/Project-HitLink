"use client";

import { useActionState } from "react";

export interface SignatureFormState {
  error: string | null;
  success: boolean;
}

export const emptySignatureFormState: SignatureFormState = {
  error: null,
  success: false,
};

export function FormSignatureForm({
  action,
  signerName,
  signerEmail,
  requestId,
  token,
  disabled = false,
  submitLabel,
  pendingLabel,
}: {
  action: (
    previousState: SignatureFormState,
    formData: FormData,
  ) => Promise<SignatureFormState>;
  signerName: string;
  signerEmail: string | null;
  requestId?: string;
  token?: string;
  disabled?: boolean;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(
    action,
    emptySignatureFormState,
  );
  const isDisabled = disabled || isPending || state.success;

  if (state.success) {
    return (
      <div className="member-card" role="status">
        <p className="member-eyebrow">Signature recorded</p>
        <h3>Thanks</h3>
        <p className="member-copy">
          The current form version has been signed and saved.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="member-form-stack">
      {requestId ? <input name="requestId" type="hidden" value={requestId} /> : null}
      {token ? <input name="token" type="hidden" value={token} /> : null}

      <label className="trial-field">
        <span>Full legal name</span>
        <input
          defaultValue={signerName}
          disabled={isDisabled}
          name="signerName"
          type="text"
        />
      </label>

      <label className="trial-field">
        <span>Email</span>
        <input
          defaultValue={signerEmail ?? ""}
          disabled={isDisabled}
          name="signerEmail"
          placeholder="Optional"
          type="email"
        />
      </label>

      <label className="member-copy" style={{ display: "block" }}>
        <input disabled={isDisabled} name="acceptedConsent" type="checkbox" /> I
        confirm I reviewed this PDF and agree to sign the current version.
      </label>

      {state.error ? <p className="member-form-error">{state.error}</p> : null}

      <button className="button" disabled={isDisabled} type="submit">
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

