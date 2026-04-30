"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createTrialBookingAction,
  emptyTrialBookingFormState,
} from "./actions";

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

  if (state.confirmation) {
    return (
      <section className="trial-card" role="status">
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

  return (
    <form action={formAction} className="trial-card trial-form">
      <input name="workspaceId" type="hidden" value={workspaceId} />

      <label className="trial-field">
        <span>Trial class</span>
        <select name="bookingOption">
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

      <label className="trial-field">
        <span>Participant full name</span>
        <input name="fullName" placeholder="Jordan Lee" type="text" />
      </label>

      <div className="trial-field-row">
        <label className="trial-field">
          <span>Email</span>
          <input name="email" placeholder="jordan@example.com" type="email" />
        </label>

        <label className="trial-field">
          <span>Phone</span>
          <input name="phone" placeholder="Optional if email is set" type="tel" />
        </label>
      </div>

      <label className="trial-field">
        <span>Date of birth</span>
        <input name="dateOfBirth" type="date" />
      </label>

      <section className="trial-subsection">
        <p className="trial-eyebrow">Guardian details</p>
        <p>Use this for a child participant. Leave blank for adults.</p>

        <label className="trial-field">
          <span>Guardian full name</span>
          <input
            name="guardianFullName"
            placeholder="Alex Lee"
            type="text"
          />
        </label>

        <div className="trial-field-row">
          <label className="trial-field">
            <span>Guardian email</span>
            <input
              name="guardianEmail"
              placeholder="alex@example.com"
              type="email"
            />
          </label>

          <label className="trial-field">
            <span>Guardian phone</span>
            <input name="guardianPhone" placeholder="Optional" type="tel" />
          </label>
        </div>

        <label className="trial-field">
          <span>Relationship</span>
          <input name="relationshipLabel" placeholder="Parent" type="text" />
        </label>
      </section>

      {state.error ? <p className="trial-error">{state.error}</p> : null}

      <button className="trial-button" disabled={isPending} type="submit">
        {isPending ? "Booking trial..." : "Book trial"}
      </button>
    </form>
  );
}
