"use client";

import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { emptyFormState } from "../../lib/admin-access";
import { onboardingAction } from "./actions";

interface OnboardingFormProps {
  defaultTimezone: string;
}

export function OnboardingForm({ defaultTimezone }: OnboardingFormProps) {
  const [state, formAction] = useActionState(
    onboardingAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Workspace name</span>
        <input
          autoComplete="organization"
          name="workspaceName"
          placeholder="Sahara Muay Thai"
          type="text"
        />
      </label>

      <label className="field">
        <span>Business type</span>
        <input
          name="businessType"
          placeholder="Muay Thai gym"
          type="text"
        />
      </label>

      <label className="field">
        <span>Timezone</span>
        <input
          defaultValue={defaultTimezone}
          name="timezone"
          placeholder="America/Vancouver"
          type="text"
        />
      </label>

      <label className="field">
        <span>Address line 1</span>
        <input name="addressLine1" type="text" />
      </label>

      <label className="field">
        <span>Address line 2</span>
        <input name="addressLine2" type="text" />
      </label>

      <div className="field-row">
        <label className="field">
          <span>City</span>
          <input name="city" type="text" />
        </label>

        <label className="field">
          <span>Region</span>
          <input name="region" type="text" />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Postal code</span>
          <input name="postalCode" type="text" />
        </label>

        <label className="field">
          <span>Country code</span>
          <input
            maxLength={2}
            name="countryCode"
            placeholder="CA"
            type="text"
          />
        </label>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Creating workspace...">
        Create workspace
      </SubmitButton>
    </form>
  );
}
