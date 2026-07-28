"use client";

import {
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { SubmitButton } from "../_components/submit-button";
import { emptyFormState } from "../../lib/route-decisions";
import { onboardingAction } from "./actions";
import {
  onboardingRequiredFieldNames,
  type OnboardingFieldErrors,
  type OnboardingRequiredFieldName,
  validateOnboardingFields,
} from "./onboarding-validation";

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
  const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const submittedValuesRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (!state.error || !submittedValuesRef.current || !formRef.current) {
      return;
    }

    const submittedValues = submittedValuesRef.current;
    formRef.current
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input:not([type='hidden']), textarea, select",
      )
      .forEach((field) => {
        const submittedValue = submittedValues[field.name];
        if (submittedValue !== undefined) {
          field.value = submittedValue;
        }
      });
  }, [state.error]);

  function clearFieldError(fieldName: OnboardingRequiredFieldName) {
    setFieldErrors((current) => {
      if (!current[fieldName]) {
        return current;
      }

      const next = { ...current };
      delete next[fieldName];
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const errors = validateOnboardingFields({
      workspaceName: String(formData.get("workspaceName") ?? ""),
      currentSoftware: String(formData.get("currentSoftware") ?? ""),
      accessInstructions: String(formData.get("accessInstructions") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });

    if (Object.keys(errors).length === 0) {
      submittedValuesRef.current = Object.fromEntries(
        Array.from(formData.entries(), ([name, value]) => [
          name,
          typeof value === "string" ? value : value.name,
        ]),
      );
      setFieldErrors({});
      return;
    }

    event.preventDefault();
    setFieldErrors(errors);

    const firstInvalidField = onboardingRequiredFieldNames.find(
      (fieldName) => errors[fieldName],
    );
    if (firstInvalidField) {
      event.currentTarget
        .querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)
        ?.focus();
    }
  }

  const clientErrorCount = Object.keys(fieldErrors).length;

  return (
    <form
      action={formAction}
      className="form-stack"
      noValidate
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <div className="service-promise" role="note">
        <strong>Flowstate handles the migration work.</strong>
        <p>
          Tell us which system you use, what exports are available, and who can
          coordinate access. Flowstate stages, validates, and reconciles the
          migration before daily operations begin.
        </p>
      </div>

      {clientErrorCount > 0 ? (
        <div className="form-error" role="alert">
          <strong>Check the highlighted fields and try again.</strong>
          <p>Your details are still here. Correct the fields below.</p>
        </div>
      ) : null}

      {dataScopeOptions.map((option) => (
        <input key={option} name="dataScope" type="hidden" value={option} />
      ))}

      <label className="field">
        <span>
          Gym name <em className="field-required">Required</em>
        </span>
        <input
          aria-describedby={
            fieldErrors.workspaceName ? "workspaceName-error" : undefined
          }
          aria-invalid={fieldErrors.workspaceName ? "true" : undefined}
          aria-required="true"
          autoComplete="organization"
          name="workspaceName"
          onChange={() => clearFieldError("workspaceName")}
          placeholder="Sahara Muay Thai"
          type="text"
        />
        {fieldErrors.workspaceName ? (
          <p className="field-error" id="workspaceName-error">
            {fieldErrors.workspaceName}
          </p>
        ) : null}
      </label>

      <label className="field">
        <span>
          Current software <em className="field-required">Required</em>
        </span>
        <input
          aria-describedby={`currentSoftware-help${fieldErrors.currentSoftware ? " currentSoftware-error" : ""}`}
          aria-invalid={fieldErrors.currentSoftware ? "true" : undefined}
          aria-required="true"
          name="currentSoftware"
          onChange={() => clearFieldError("currentSoftware")}
          placeholder="Zen Planner, Mindbody, Wodify, spreadsheets..."
          type="text"
        />
        <p className="field-help" id="currentSoftware-help">
          This tells the migration team which export and validation path to
          prepare.
        </p>
        {fieldErrors.currentSoftware ? (
          <p className="field-error" id="currentSoftware-error">
            {fieldErrors.currentSoftware}
          </p>
        ) : null}
      </label>

      <label className="field">
        <span>
          Export and access coordination{" "}
          <em className="field-required">Required</em>
        </span>
        <textarea
          aria-describedby={`accessInstructions-help accessInstructions-safety${fieldErrors.accessInstructions ? " accessInstructions-error" : ""}`}
          aria-invalid={fieldErrors.accessInstructions ? "true" : undefined}
          aria-required="true"
          name="accessInstructions"
          onChange={() => clearFieldError("accessInstructions")}
          placeholder="Describe available exports and who can coordinate access."
          rows={4}
        />
        <p className="field-help" id="accessInstructions-help">
          If exports are not ready, describe what is blocking them.
        </p>
        <p className="field-safety" id="accessInstructions-safety">
          Do not paste passwords, API keys, payment credentials, private export
          links, or live member data here.
        </p>
        {fieldErrors.accessInstructions ? (
          <p className="field-error" id="accessInstructions-error">
            {fieldErrors.accessInstructions}
          </p>
        ) : null}
      </label>

      <div className="field-row">
        <label className="field">
          <span>
            Launch timezone <em className="field-required">Required</em>
          </span>
          <input
            aria-describedby={fieldErrors.timezone ? "timezone-error" : undefined}
            aria-invalid={fieldErrors.timezone ? "true" : undefined}
            aria-required="true"
            defaultValue={defaultTimezone}
            name="timezone"
            onChange={() => clearFieldError("timezone")}
            placeholder="America/Vancouver"
            type="text"
          />
          {fieldErrors.timezone ? (
            <p className="field-error" id="timezone-error">
              {fieldErrors.timezone}
            </p>
          ) : null}
        </label>

        <label className="field">
          <span>Preferred go-live date</span>
          <input name="targetGoLiveDate" type="date" />
        </label>
      </div>

      <details className="optional-details">
        <summary>
          <span>Migration planning details</span>
          <strong>
            Optional. These details help Flowstate plan your migration.
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

      {state.error ? (
        <div className="form-error" role="alert">
          <strong>We could not start the handoff.</strong>
          <p>{state.error}</p>
          <p>Your details are still here. Correct the issue and try again.</p>
        </div>
      ) : null}

      <SubmitButton pendingLabel="Starting migration...">
        Start migration handoff
      </SubmitButton>
    </form>
  );
}
