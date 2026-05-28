"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { waitlistStyles } from "../lib/content";
import type { WaitlistState } from "../lib/waitlist";
import { joinWaitlistAction } from "./actions";

const initialState: WaitlistState = {
  status: "idle",
  message: "",
  errors: {},
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button button-primary form-submit" disabled={pending} type="submit">
      {pending ? "Saving your place" : "Join the Founding Gym waitlist"}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="field-error">{message}</p>;
}

export function WaitlistForm() {
  const [state, formAction] = useActionState(joinWaitlistAction, initialState);
  const hasMessage = Boolean(state.message);

  return (
    <form action={formAction} className="waitlist-form" noValidate>
      <div className="form-intro">
        <p className="section-kicker">Founding Gym access</p>
        <h2>Join the first wave of Flowstate gyms.</h2>
        <p>
          Founding gyms receive 15% off monthly pricing, grandfathered after
          launch.
        </p>
      </div>

      {hasMessage ? (
        <div
          className={
            state.status === "success"
              ? "form-message form-message-success"
              : "form-message form-message-error"
          }
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </div>
      ) : null}

      <div className="field-grid">
        <label className="field">
          <span>Your name</span>
          <input
            aria-describedby={state.errors.ownerName ? "ownerName-error" : undefined}
            aria-invalid={Boolean(state.errors.ownerName)}
            autoComplete="name"
            id="ownerName"
            name="ownerName"
            required
            type="text"
          />
          <span id="ownerName-error">
            <FieldError message={state.errors.ownerName} />
          </span>
        </label>

        <label className="field">
          <span>Gym name</span>
          <input
            aria-describedby={state.errors.gymName ? "gymName-error" : undefined}
            aria-invalid={Boolean(state.errors.gymName)}
            autoComplete="organization"
            id="gymName"
            name="gymName"
            required
            type="text"
          />
          <span id="gymName-error">
            <FieldError message={state.errors.gymName} />
          </span>
        </label>
      </div>

      <label className="field">
        <span>Email</span>
        <input
          aria-describedby={state.errors.email ? "email-error" : undefined}
          aria-invalid={Boolean(state.errors.email)}
          autoComplete="email"
          id="email"
          name="email"
          required
          type="email"
        />
        <span id="email-error">
          <FieldError message={state.errors.email} />
        </span>
      </label>

      <label className="field">
        <span>Primary style</span>
        <select
          aria-describedby={state.errors.style ? "style-error" : undefined}
          aria-invalid={Boolean(state.errors.style)}
          id="style"
          name="style"
          required
        >
          <option value="">Choose one</option>
          {waitlistStyles.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
        <span id="style-error">
          <FieldError message={state.errors.style} />
        </span>
      </label>

      <label className="field">
        <span>What should Flowstate solve first?</span>
        <textarea
          aria-describedby={state.errors.note ? "note-error" : undefined}
          aria-invalid={Boolean(state.errors.note)}
          id="note"
          maxLength={500}
          name="note"
          rows={4}
        />
        <span id="note-error">
          <FieldError message={state.errors.note} />
        </span>
      </label>

      <SubmitButton />
    </form>
  );
}
