"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/admin-access";
import { createMemberAction, updateMemberAction } from "./actions";

const memberStatusOptions = [
  ["ACTIVE", "Active"],
  ["TRIAL", "Trial"],
  ["OVERDUE", "Overdue"],
  ["FROZEN", "Frozen"],
  ["CANCELLED", "Cancelled"],
  ["WAITLISTED", "Waitlisted"],
] as const;

const formStatusOptions = [
  ["NOT_REQUESTED", "Not requested"],
  ["PENDING", "Pending"],
  ["COMPLETE", "Complete"],
] as const;

interface MemberFormValue {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  status: string;
  notes: string | null;
  tags: string[];
  formStatus: string;
}

function formatDateForInput(value: Date | null): string {
  return value?.toISOString().slice(0, 10) ?? "";
}

function MemberFields({ member }: { member?: MemberFormValue }) {
  return (
    <>
      {member ? <input name="memberId" type="hidden" value={member.id} /> : null}

      <label className="field">
        <span>Full name</span>
        <input
          defaultValue={member?.fullName ?? ""}
          name="fullName"
          placeholder="Jordan Lee"
          type="text"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Email</span>
          <input
            defaultValue={member?.email ?? ""}
            name="email"
            placeholder="jordan@example.com"
            type="email"
          />
        </label>

        <label className="field">
          <span>Phone</span>
          <input
            defaultValue={member?.phone ?? ""}
            name="phone"
            placeholder="Optional"
            type="tel"
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Date of birth</span>
          <input
            defaultValue={formatDateForInput(member?.dateOfBirth ?? null)}
            name="dateOfBirth"
            type="date"
          />
        </label>

        <label className="field">
          <span>Status</span>
          <select defaultValue={member?.status ?? "TRIAL"} name="status">
            {memberStatusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Tags</span>
        <input
          defaultValue={member?.tags.join(", ") ?? ""}
          name="tags"
          placeholder="Beginner, trial, youth"
          type="text"
        />
        <p className="field-help">Comma-separated, up to 10 tags.</p>
      </label>

      <label className="field">
        <span>Waiver/form status</span>
        <select
          defaultValue={member?.formStatus ?? "NOT_REQUESTED"}
          name="formStatus"
        >
          {formStatusOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          defaultValue={member?.notes ?? ""}
          name="notes"
          placeholder="Internal notes only."
          rows={5}
        />
      </label>
    </>
  );
}

export function MemberCreateForm() {
  const [state, formAction] = useActionState(createMemberAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack">
      <MemberFields />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving member...">Create member</SubmitButton>
    </form>
  );
}

export function MemberEditForm({ member }: { member: MemberFormValue }) {
  const [state, formAction] = useActionState(updateMemberAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack">
      <MemberFields member={member} />

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving member...">Save member</SubmitButton>
    </form>
  );
}
