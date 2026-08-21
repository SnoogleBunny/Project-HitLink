"use client";

import Link from "next/link";
import {
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { emptyTrialBookingFormState } from "../../form-states";
import { createTrialBookingAction } from "./actions";

const errorSummaryId = "trial-booking-error-summary";

type TrialFieldName =
  | "bookingOption"
  | "fullName"
  | "email"
  | "phone"
  | "dateOfBirth"
  | "guardianFullName"
  | "guardianEmail"
  | "guardianPhone"
  | "relationshipLabel";

interface TrialFieldError {
  field: TrialFieldName;
  message: string;
}

interface TrialBookingDateOptionView {
  classTemplateId: string;
  scheduledForDate: string;
  label: string;
}

interface TrialBookingTemplateOptionView {
  id: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  coachDisplayName: string;
  dateOptions: TrialBookingDateOptionView[];
}

function readField(formData: FormData, field: TrialFieldName): string {
  return String(formData.get(field) ?? "").trim();
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientErrors(form: HTMLFormElement): TrialFieldError[] {
  const formData = new FormData(form);
  const bookingOption = readField(formData, "bookingOption");
  const fullName = readField(formData, "fullName");
  const email = readField(formData, "email");
  const phone = readField(formData, "phone");
  const guardianFullName = readField(formData, "guardianFullName");
  const guardianEmail = readField(formData, "guardianEmail");
  const guardianPhone = readField(formData, "guardianPhone");
  const errors: TrialFieldError[] = [];

  if (!bookingOption) {
    errors.push({
      field: "bookingOption",
      message: "Choose an available trial class date.",
    });
  }

  if (!fullName) {
    errors.push({
      field: "fullName",
      message: "Enter the participant’s full name.",
    });
  }

  if (email && !isEmailLike(email)) {
    errors.push({
      field: "email",
      message: "Enter a valid participant email address.",
    });
  } else if (!email && !phone) {
    errors.push({
      field: "email",
      message: "Enter an email or phone number.",
    });
  }

  if (guardianEmail && !isEmailLike(guardianEmail)) {
    errors.push({
      field: "guardianEmail",
      message: "Enter a valid guardian email address.",
    });
  }

  if ((guardianEmail || guardianPhone) && !guardianFullName) {
    errors.push({
      field: "guardianFullName",
      message: "Enter the guardian’s full name with their contact details.",
    });
  }

  return errors;
}

function getServerErrorField(error: string | null): TrialFieldName | null {
  if (!error) {
    return null;
  }

  const normalizedError = error.toLowerCase();

  if (normalizedError.includes("guardian full name")) {
    return "guardianFullName";
  }

  if (normalizedError.includes("guardian email")) {
    return "guardianEmail";
  }

  if (normalizedError.includes("participant full name")) {
    return "fullName";
  }

  if (
    normalizedError.includes("participant email") ||
    normalizedError.includes("email or phone")
  ) {
    return "email";
  }

  if (normalizedError.includes("date of birth")) {
    return "dateOfBirth";
  }

  if (
    normalizedError.includes("trial date") ||
    normalizedError.includes("class is full") ||
    normalizedError.includes("already has a booking")
  ) {
    return "bookingOption";
  }

  return null;
}

function focusField(form: HTMLFormElement | null, field: TrialFieldName): void {
  const control = form?.elements.namedItem(field);

  if (control instanceof HTMLElement) {
    control.focus();
  }
}

function describedBy(...ids: Array<string | null>): string | undefined {
  const value = ids.filter(Boolean).join(" ");

  return value || undefined;
}

export function TrialBookingForm({
  workspaceId,
  templates,
}: {
  workspaceId: string;
  templates: TrialBookingTemplateOptionView[];
}) {
  const [state, formAction, isPending] = useActionState(
    createTrialBookingAction,
    emptyTrialBookingFormState,
  );
  const [clientErrors, setClientErrors] = useState<TrialFieldError[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const hasEligibleDates = templates.some(
    (template) => template.dateOptions.length > 0,
  );
  const serverErrorField = getServerErrorField(state.error);
  const visibleErrors =
    clientErrors.length > 0
      ? clientErrors
      : state.error
        ? [{ field: serverErrorField, message: state.error }]
        : [];

  useEffect(() => {
    if (!state.error) {
      return;
    }

    if (serverErrorField) {
      focusField(formRef.current, serverErrorField);
      return;
    }

    errorSummaryRef.current?.focus();
  }, [serverErrorField, state]);

  function hasFieldError(field: TrialFieldName): boolean {
    return (
      clientErrors.some((error) => error.field === field) ||
      serverErrorField === field
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    const nextErrors = getClientErrors(event.currentTarget);

    if (nextErrors.length === 0) {
      setClientErrors([]);
      return;
    }

    event.preventDefault();
    setClientErrors(nextErrors);
    const firstErrorField = nextErrors[0]?.field;

    if (firstErrorField) {
      requestAnimationFrame(() => {
        focusField(formRef.current, firstErrorField);
      });
    }
  }

  function handleFieldChange(field: TrialFieldName): void {
    setClientErrors((currentErrors) =>
      currentErrors.filter((error) => error.field !== field),
    );
  }

  if (state.confirmation) {
    return (
      <section aria-live="polite" className="trial-card" role="status">
        <p className="trial-eyebrow">Trial booked</p>
        <h2>{state.confirmation.classTitle}</h2>
        <p>
          Your trial request is booked for{" "}
          {state.confirmation.scheduledForDate}. The gym team can see it in
          their member admin view.
        </p>
        {state.confirmation.forms.length > 0 ? (
          <>
            <p>Complete the current required forms now:</p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {state.confirmation.forms.map((form) => (
                <Link
                  key={form.requestId}
                  className="button button-secondary"
                  href={form.href}
                >
                  {form.label}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  if (!hasEligibleDates) {
    return (
      <section aria-live="polite" className="trial-card" role="status">
        <p className="trial-eyebrow">No trial dates</p>
        <h2>Trial booking is unavailable right now</h2>
        <p>Check back later for an available trial date.</p>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className="trial-card trial-form"
      noValidate
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <input name="workspaceId" type="hidden" value={workspaceId} />

      <label className="trial-field" htmlFor="trial-booking-option">
        <span>Trial class</span>
        <select
          aria-describedby={
            hasFieldError("bookingOption") ? errorSummaryId : undefined
          }
          aria-invalid={hasFieldError("bookingOption") || undefined}
          id="trial-booking-option"
          name="bookingOption"
          onChange={() => handleFieldChange("bookingOption")}
          required
        >
          <option value="">Choose a class date</option>
          {templates.map((template) => (
            <optgroup
              key={template.id}
              label={`${template.displayTitle} · ${template.roomName}`}
            >
              {template.dateOptions.map((option) => (
                <option
                  key={`${option.classTemplateId}-${option.scheduledForDate}`}
                  value={`${option.classTemplateId}|${option.scheduledForDate}`}
                >
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="trial-field" htmlFor="trial-participant-name">
        <span>Participant full name</span>
        <input
          aria-describedby={
            hasFieldError("fullName") ? errorSummaryId : undefined
          }
          aria-invalid={hasFieldError("fullName") || undefined}
          autoComplete="name"
          id="trial-participant-name"
          name="fullName"
          onChange={() => handleFieldChange("fullName")}
          placeholder="Jordan Lee"
          required
          type="text"
        />
      </label>

      <div className="trial-field-row">
        <label className="trial-field" htmlFor="trial-participant-email">
          <span>Email</span>
          <input
            aria-describedby={describedBy(
              "trial-contact-help",
              hasFieldError("email") ? errorSummaryId : null,
            )}
            aria-invalid={hasFieldError("email") || undefined}
            autoComplete="email"
            id="trial-participant-email"
            name="email"
            onChange={() => handleFieldChange("email")}
            placeholder="jordan@example.com"
            type="email"
          />
        </label>

        <label className="trial-field" htmlFor="trial-participant-phone">
          <span>Phone</span>
          <input
            aria-describedby="trial-contact-help"
            autoComplete="tel"
            id="trial-participant-phone"
            name="phone"
            onChange={() => handleFieldChange("phone")}
            placeholder="Optional if email is set"
            type="tel"
          />
        </label>
      </div>

      <p id="trial-contact-help">Enter at least one contact method.</p>

      <label className="trial-field" htmlFor="trial-date-of-birth">
        <span>Date of birth</span>
        <input
          aria-describedby={
            hasFieldError("dateOfBirth") ? errorSummaryId : undefined
          }
          aria-invalid={hasFieldError("dateOfBirth") || undefined}
          autoComplete="bday"
          id="trial-date-of-birth"
          name="dateOfBirth"
          onChange={() => handleFieldChange("dateOfBirth")}
          type="date"
        />
      </label>

      <section className="trial-subsection">
        <p className="trial-eyebrow">Guardian details</p>
        <p>Use this for a child participant. Leave blank for adults.</p>

        <label className="trial-field" htmlFor="trial-guardian-name">
          <span>Guardian full name</span>
          <input
            aria-describedby={
              hasFieldError("guardianFullName") ? errorSummaryId : undefined
            }
            aria-invalid={hasFieldError("guardianFullName") || undefined}
            autoComplete="name"
            id="trial-guardian-name"
            name="guardianFullName"
            onChange={() => handleFieldChange("guardianFullName")}
            placeholder="Alex Lee"
            type="text"
          />
        </label>

        <div className="trial-field-row">
          <label className="trial-field" htmlFor="trial-guardian-email">
            <span>Guardian email</span>
            <input
              aria-describedby={
                hasFieldError("guardianEmail") ? errorSummaryId : undefined
              }
              aria-invalid={hasFieldError("guardianEmail") || undefined}
              autoComplete="email"
              id="trial-guardian-email"
              name="guardianEmail"
              onChange={() => handleFieldChange("guardianEmail")}
              placeholder="alex@example.com"
              type="email"
            />
          </label>

          <label className="trial-field" htmlFor="trial-guardian-phone">
            <span>Guardian phone</span>
            <input
              autoComplete="tel"
              id="trial-guardian-phone"
              name="guardianPhone"
              onChange={() => handleFieldChange("guardianPhone")}
              placeholder="Optional"
              type="tel"
            />
          </label>
        </div>

        <label className="trial-field" htmlFor="trial-guardian-relationship">
          <span>Relationship</span>
          <input
            autoComplete="off"
            id="trial-guardian-relationship"
            name="relationshipLabel"
            onChange={() => handleFieldChange("relationshipLabel")}
            placeholder="Parent"
            type="text"
          />
        </label>
      </section>

      {visibleErrors.length > 0 ? (
        <div
          aria-live="assertive"
          className="trial-error"
          id={errorSummaryId}
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          {visibleErrors.length > 1 ? (
            <>
              <p>Check these details:</p>
              <ul>
                {visibleErrors.map((error) => (
                  <li key={`${error.field}-${error.message}`}>
                    {error.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{visibleErrors[0]?.message}</p>
          )}
        </div>
      ) : null}

      <button
        aria-describedby={
          state.error && !serverErrorField ? errorSummaryId : undefined
        }
        className="trial-button"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Booking trial..." : "Book trial"}
      </button>
    </form>
  );
}
