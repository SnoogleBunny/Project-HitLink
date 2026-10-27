"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { createMemberAction, updateMemberAction } from "./actions";

interface MemberFormValue {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  profileVersion?: number;
}

function formatDateForInput(value: Date | null): string {
  return value?.toISOString().slice(0, 10) ?? "";
}
function MemberFormError({ state }: { state: { error: string | null } }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) ref.current?.focus();
  }, [state]);
  return state.error ? (
    <p ref={ref} tabIndex={-1} role="alert" className="form-error">
      {state.error}
    </p>
  ) : null;
}

function MemberFields({ member }: { member?: MemberFormValue }) {
  const [values, setValues] = useState({
    fullName: member?.fullName ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    dateOfBirth: formatDateForInput(member?.dateOfBirth ?? null),
    reason: "",
  });
  const change = (field: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  return (
    <>
      {member ? (
        <input name="memberId" type="hidden" value={member.id} />
      ) : null}

      <label className="field">
        <span>Full name</span>
        <input
          value={values.fullName}
          onChange={(event) => change("fullName", event.target.value)}
          name="fullName"
          placeholder="Jordan Lee"
          type="text"
          maxLength={200}
          required
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Email</span>
          <input
            value={values.email}
            onChange={(event) => change("email", event.target.value)}
            name="email"
            placeholder="jordan@example.com"
            type="email"
            maxLength={254}
          />
        </label>

        <label className="field">
          <span>Phone</span>
          <input
            value={values.phone}
            onChange={(event) => change("phone", event.target.value)}
            name="phone"
            placeholder="Optional"
            type="tel"
            maxLength={60}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Date of birth</span>
          <input
            value={values.dateOfBirth}
            onChange={(event) => change("dateOfBirth", event.target.value)}
            name="dateOfBirth"
            type="date"
          />
        </label>
      </div>
      <p className="field-help">
        These are member contact details. Saving them does not change sign-in
        details, service access, internal notes or cohort tags.
      </p>
      {member ? (
        <label className="field">
          <span>Reason for profile change</span>
          <input
            name="reason"
            value={values.reason}
            onChange={(event) => change("reason", event.target.value)}
            minLength={5}
            maxLength={500}
            required
          />
        </label>
      ) : null}
    </>
  );
}

export function MemberCreateForm({ operationId }: { operationId: string }) {
  const [state, formAction] = useActionState(
    createMemberAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <input type="hidden" name="operationId" value={operationId} />
      <MemberFields />

      <MemberFormError state={state} />

      <SubmitButton pendingLabel="Saving member...">Create member</SubmitButton>
    </form>
  );
}

export function MemberEditForm({
  member,
  operationId,
}: {
  member: MemberFormValue;
  operationId: string;
}) {
  const [state, formAction] = useActionState(
    updateMemberAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <input type="hidden" name="operationId" value={operationId} />
      <input
        type="hidden"
        name="expectedVersion"
        value={member.profileVersion ?? 0}
      />
      <MemberFields member={member} />

      <MemberFormError state={state} />

      <SubmitButton pendingLabel="Saving member...">Save member</SubmitButton>
    </form>
  );
}
