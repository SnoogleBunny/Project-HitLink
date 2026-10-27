"use client";
import { useActionState, useState } from "react";
import { onboardingAction } from "./actions";
import { OnboardingForm } from "./onboarding-form";
import { emptyFormState } from "../../lib/route-decisions";
import { SubmitButton } from "../_components/submit-button";

export function OnboardingChoice({
  defaultTimezone,
  ownerEmail,
}: {
  defaultTimezone: string;
  ownerEmail: string;
}) {
  const [kind, setKind] = useState("MIGRATION");
  const [state, action] = useActionState(onboardingAction, emptyFormState);
  return (
    <div className="form-stack">
      <fieldset className="form-stack">
        <legend>How are you starting?</legend>
        <label className="field-checkbox">
          <input
            type="radio"
            name="setupPath"
            checked={kind === "MIGRATION"}
            onChange={() => setKind("MIGRATION")}
          />
          <span>Move an existing business from another system</span>
        </label>
        <label className="field-checkbox">
          <input
            type="radio"
            name="setupPath"
            checked={kind === "NEW_BUSINESS"}
            onChange={() => setKind("NEW_BUSINESS")}
          />
          <span>Start a new business with no legacy import</span>
        </label>
      </fieldset>
      {kind === "MIGRATION" ? (
        <OnboardingForm defaultTimezone={defaultTimezone} />
      ) : (
        <form
          action={action}
          className="form-stack"
          onReset={(event) => event.preventDefault()}
        >
          <input type="hidden" name="onboardingKind" value="NEW_BUSINESS" />
          <p>
            Choose your business details, verify your owner email and review a
            setup snapshot before activation. You can add services afterward. A
            coaching-only business needs no class schedule, gym membership or
            physical room.
          </p>
          <label className="field">
            <span>Business name</span>
            <input
              name="workspaceName"
              maxLength={120}
              autoComplete="organization"
              required
            />
          </label>
          <label className="field">
            <span>Business type (optional)</span>
            <input
              name="businessType"
              maxLength={80}
              placeholder="Martial arts, adult life coaching…"
            />
          </label>
          <label className="field">
            <span>Services to configure</span>
            <select name="serviceMode" required defaultValue="">
              <option value="" disabled>
                Choose services
              </option>
              <option value="MARTIAL_ARTS">Martial arts and classes</option>
              <option value="COACHING">Adult life coaching only</option>
              <option value="HYBRID">
                Martial arts and adult life coaching
              </option>
            </select>
          </label>
          <label className="field">
            <span>Business contact email</span>
            <input
              name="contactEmail"
              type="email"
              maxLength={254}
              required
              defaultValue={ownerEmail}
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Business timezone</span>
            <input
              name="timezone"
              required
              defaultValue={defaultTimezone}
              placeholder="America/Vancouver"
            />
          </label>
          <label className="field">
            <span>Business currency</span>
            <select name="currency" required defaultValue="">
              <option value="" disabled>
                Choose currency
              </option>
              {["cad", "usd", "eur", "gbp", "aud", "nzd", "jpy", "krw"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            <span>Date and number locale</span>
            <input
              name="locale"
              required
              defaultValue="en-CA"
              placeholder="en-CA"
            />
          </label>
          <p>
            A virtual business can leave its address blank. Business identity
            and regional details remain editable in Settings.
          </p>
          {state.error ? (
            <p role="alert" className="form-error">
              {state.error}
            </p>
          ) : null}
          <SubmitButton pendingLabel="Preparing business…">
            Prepare new business
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
