"use client";

import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { emptyFormState } from "../../lib/route-decisions";
import { onboardingAction } from "./actions";

interface OnboardingFormProps {
  defaultTimezone: string;
}

const dataScopeOptions = [
  "Members and contact details",
  "Guardians and family links",
  "Memberships and billing status",
  "Punch-card balances",
  "Drop-in products",
  "Programs and weekly schedule",
  "Forms and waivers",
  "Historical billing records",
  "Attendance history",
];

export function OnboardingForm({ defaultTimezone }: OnboardingFormProps) {
  const [state, formAction] = useActionState(onboardingAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack">
      <div className="service-promise" role="note">
        <strong>Flowstate handles the migration work.</strong>
        <p>
          You share the system, export path, or access handoff. Our operators
          stage, validate, reconcile, and coordinate readiness before daily
          operations turn on.
        </p>
      </div>

      {dataScopeOptions.map((option) => (
        <input key={option} name="dataScope" type="hidden" value={option} />
      ))}

      <label className="field">
        <span>
          Gym name <em className="field-required">Required</em>
        </span>
        <input
          autoComplete="organization"
          aria-required="true"
          name="workspaceName"
          placeholder="Sahara Muay Thai"
          type="text"
        />
      </label>

      <label className="field">
        <span>
          Current software <em className="field-required">Required</em>
        </span>
        <input
          aria-required="true"
          name="currentSoftware"
          placeholder="Zen Planner, Mindbody, Wodify, spreadsheets..."
          type="text"
        />
        <p className="field-help">
          This tells the migration team which export and validation path to
          prepare.
        </p>
      </label>

      <label className="field">
        <span>
          Access or export instructions{" "}
          <em className="field-required">Required</em>
        </span>
        <textarea
          aria-required="true"
          name="accessInstructions"
          placeholder="Paste export links, describe where the CSVs live, share handoff notes, or tell us who should coordinate access."
          rows={4}
        />
        <p className="field-help">
          If exports are not ready yet, say where you are stuck. That is enough
          to start the service handoff.
        </p>
      </label>

      <div className="field-row">
        <label className="field">
          <span>
            Launch timezone <em className="field-required">Required</em>
          </span>
          <input
            aria-required="true"
            defaultValue={defaultTimezone}
            name="timezone"
            placeholder="America/Vancouver"
            type="text"
          />
        </label>

        <label className="field">
          <span>Preferred go-live date</span>
          <input name="targetGoLiveDate" type="date" />
        </label>
      </div>

      <details className="optional-details">
        <summary>
          <span>Pricing and scope details</span>
          <strong>
            Optional, but helpful for quoting the migration service
          </strong>
        </summary>

        <div className="form-stack">
          <div className="field-row">
            <label className="field">
              <span>Approximate member count</span>
              <input min={0} name="memberCountEstimate" type="number" />
            </label>

            <label className="field">
              <span>Business type</span>
              <input
                name="businessType"
                placeholder="Muay Thai gym"
                type="text"
              />
            </label>
          </div>

          <label className="field">
            <span>Billing state</span>
            <textarea
              name="billingStatus"
              placeholder="Active subscriptions, punch cards, failed payments, prepaid balances..."
              rows={3}
            />
          </label>

          <label className="field">
            <span>Schedule complexity</span>
            <textarea
              name="scheduleComplexity"
              placeholder="Weekly classes, rooms, programs, coaches, special schedules..."
              rows={3}
            />
          </label>

          <label className="field">
            <span>Forms and waivers</span>
            <textarea
              name="formsAndWaivers"
              placeholder="Waivers, agreements, child/guardian forms, or PDFs that need to carry over."
              rows={3}
            />
          </label>

          <details className="nested-details">
            <summary>Location details</summary>

            <div className="form-stack">
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
            </div>
          </details>
        </div>
      </details>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Starting migration...">
        Start migration handoff
      </SubmitButton>
    </form>
  );
}
