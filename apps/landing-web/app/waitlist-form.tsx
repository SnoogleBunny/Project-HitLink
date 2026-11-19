"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { waitlistStyles } from "../lib/content";
import type { WaitlistState } from "../lib/waitlist";
import { joinWaitlistAction } from "./actions";

const initialState: WaitlistState = {
  status: "idle",
  message: "",
  errors: {},
};

function SubmitButton({ terminal }: { terminal: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="button button-primary form-submit"
      disabled={pending || terminal}
      type="submit"
    >
      {pending
        ? "Saving your request…"
        : terminal
          ? "Request saved locally"
          : "Join the Founding Gym waitlist"}
    </button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <span className="field-error" id={id}>
      {message}
    </span>
  );
}

const fieldOrder = ["ownerName", "gymName", "email", "style", "note"] as const;

export function WaitlistForm() {
  const [state, formAction] = useActionState(joinWaitlistAction, initialState);
  const hasMessage = Boolean(state.message);
  const attemptIdRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const terminal = state.status === "success" || state.status === "duplicate";
  const firstInvalidField = fieldOrder.find((field) => state.errors[field]);

  useEffect(() => {
    submittingRef.current = false;

    if (state.status === "error" && state.message) {
      messageRef.current?.focus();
    }
  }, [state.message, state.status]);

  return (
    <form
      action={formAction}
      className="waitlist-form"
      noValidate
      onSubmit={(event) => {
        if (terminal || submittingRef.current) {
          event.preventDefault();
          return;
        }

        submittingRef.current = true;
        if (attemptIdRef.current && !attemptIdRef.current.value) {
          attemptIdRef.current.value = crypto.randomUUID();
        }
      }}
    >
      <input
        defaultValue={state.attemptId}
        key={state.attemptId ?? "attempt-initial"}
        name="attemptId"
        ref={attemptIdRef}
        type="hidden"
      />
      <div className="form-intro">
        <p className="section-kicker">Founding Gym access</p>
        <h2>Join the first wave of Flowstate gyms.</h2>
        <p>
          Qualifying gyms that join the Founding Gym waitlist and onboard during
          the founding window receive 15% off monthly software pricing. The 15%
          discount is grandfathered after launch.
        </p>
      </div>

      <div className="form-fields">
        {hasMessage ? (
          <div
            aria-atomic="true"
            className={
              state.status === "success" || state.status === "duplicate"
                ? "form-message form-message-success"
                : "form-message form-message-error"
            }
            ref={messageRef}
            role={
              state.status === "success" || state.status === "duplicate"
                ? "status"
                : "alert"
            }
            tabIndex={state.status === "error" ? -1 : undefined}
          >
            {state.status === "error" && firstInvalidField ? (
              <a href={`#${firstInvalidField}`}>{state.message}</a>
            ) : (
              state.message
            )}
          </div>
        ) : null}

        <div className="field-grid">
          <label className="field">
            <span>Your name</span>
            <input
              aria-describedby={
                state.errors.ownerName ? "ownerName-error" : undefined
              }
              aria-invalid={Boolean(state.errors.ownerName)}
              autoComplete="name"
              defaultValue={state.values?.ownerName}
              id="ownerName"
              name="ownerName"
              required
              type="text"
            />
            <FieldError id="ownerName-error" message={state.errors.ownerName} />
          </label>

          <label className="field">
            <span>Gym name</span>
            <input
              aria-describedby={
                state.errors.gymName ? "gymName-error" : undefined
              }
              aria-invalid={Boolean(state.errors.gymName)}
              autoComplete="organization"
              defaultValue={state.values?.gymName}
              id="gymName"
              name="gymName"
              required
              type="text"
            />
            <FieldError id="gymName-error" message={state.errors.gymName} />
          </label>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Email</span>
            <input
              aria-describedby={state.errors.email ? "email-error" : undefined}
              aria-invalid={Boolean(state.errors.email)}
              autoComplete="email"
              defaultValue={state.values?.email}
              id="email"
              name="email"
              required
              type="email"
            />
            <FieldError id="email-error" message={state.errors.email} />
          </label>

          <label className="field">
            <span>Primary style</span>
            <select
              aria-describedby={state.errors.style ? "style-error" : undefined}
              aria-invalid={Boolean(state.errors.style)}
              defaultValue={state.values?.style}
              id="style"
              key={state.values?.style ?? "style-initial"}
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
            <FieldError id="style-error" message={state.errors.style} />
          </label>
        </div>

        <label className="field">
          <span>What should Flowstate solve first?</span>
          <textarea
            aria-describedby={state.errors.note ? "note-error" : undefined}
            aria-invalid={Boolean(state.errors.note)}
            defaultValue={state.values?.note}
            id="note"
            maxLength={500}
            name="note"
            rows={4}
          />
          <FieldError id="note-error" message={state.errors.note} />
        </label>

        <SubmitButton terminal={terminal} />
      </div>
    </form>
  );
}
