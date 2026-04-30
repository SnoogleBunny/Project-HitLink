"use client";

import { useActionState } from "react";
import type { FormType } from "@hitlink/db";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/admin-access";
import { createFormDocumentAction } from "./actions";

const formTypeOptions: Array<{ value: FormType; label: string }> = [
  {
    value: "WAIVER",
    label: "Waiver",
  },
  {
    value: "MEMBERSHIP_AGREEMENT",
    label: "Membership agreement",
  },
  {
    value: "CHILD_GUARDIAN_WAIVER",
    label: "Child / guardian waiver",
  },
  {
    value: "CUSTOM",
    label: "Custom form",
  },
];

export function FormDocumentCreateForm({
  pdfSizeCapLabel,
}: {
  pdfSizeCapLabel: string;
}) {
  const [state, formAction] = useActionState(
    createFormDocumentAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Form name</span>
        <input name="name" placeholder="2026 Adult Waiver" type="text" />
      </label>

      <label className="field">
        <span>Form type</span>
        <select defaultValue="WAIVER" name="formType">
          {formTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          name="description"
          placeholder="Optional owner-facing notes about when to use this form."
          rows={4}
        />
      </label>

      <label className="field">
        <span>PDF upload</span>
        <input accept="application/pdf" name="pdf" type="file" />
        <p className="field-help">PDF only. {pdfSizeCapLabel}.</p>
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Uploading form...">
        Create form
      </SubmitButton>
    </form>
  );
}

