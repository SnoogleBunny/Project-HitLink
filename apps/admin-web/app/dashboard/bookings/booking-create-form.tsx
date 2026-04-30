"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import type { BookingFormOptions } from "../../../lib/bookings";
import { createClassBookingAction } from "./actions";

export function BookingCreateForm({
  options,
}: {
  options: BookingFormOptions;
}) {
  const [state, formAction] = useActionState(
    createClassBookingAction,
    emptyFormState,
  );
  const hasRequiredOptions =
    options.members.length > 0 && options.templates.length > 0;

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Member</span>
        <select disabled={!hasRequiredOptions} name="memberId">
          <option value="">Choose a member</option>
          {options.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Class date</span>
        <select disabled={!hasRequiredOptions} name="bookingOption">
          <option value="">Choose a class date</option>
          {options.templates.map((template) => (
            <optgroup
              key={template.id}
              label={`${template.displayTitle} / ${template.roomName}`}
            >
              {template.dateOptions.map((dateOption) => (
                <option
                  key={`${dateOption.classTemplateId}-${dateOption.scheduledForDate}`}
                  value={`${dateOption.classTemplateId}|${dateOption.scheduledForDate}`}
                >
                  {dateOption.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Booking type</span>
        <select
          defaultValue="MEMBERSHIP"
          disabled={!hasRequiredOptions}
          name="bookingType"
        >
          <option value="MEMBERSHIP">Use member access</option>
          <option value="TRIAL">Trial</option>
        </select>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton
        disabled={!hasRequiredOptions}
        pendingLabel="Creating booking..."
      >
        Create booking
      </SubmitButton>
    </form>
  );
}
